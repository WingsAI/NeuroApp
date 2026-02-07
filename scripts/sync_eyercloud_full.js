/**
 * sync_eyercloud_full.js - Sincronização completa EyerCloud → NeuroApp DB
 * =========================================================================
 *
 * Este script resolve os problemas para igualar o DB aos números do EyerCloud:
 *
 * Fase 1: Resolver IDs curtos no mapping usando o state (match por nome)
 * Fase 2: Importar pacientes/exames faltantes do mapping para o DB
 * Fase 3: Corrigir pacientes com IDs curtos já no DB (migrar para IDs longos)
 * Fase 4: Relatório final com contagens
 *
 * Uso:
 *   node scripts/sync_eyercloud_full.js              # Preview (default)
 *   node scripts/sync_eyercloud_full.js --execute     # Aplicar mudanças
 *
 * SEGURANÇA:
 * - NUNCA deleta exames com MedicalReport
 * - NUNCA faz chamadas a APIs externas
 * - Usa transactions para operações multi-step
 * - Loga cada mudança
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

function loadJSON(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveJSON(filepath, data) {
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return new Date(dateStr);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  if (dateStr.includes('-')) return new Date(dateStr);
  return null;
}

function normalizeName(name) {
  return (name || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

// ============================================================
// FASE 1: Resolver IDs curtos no mapping usando o state
// ============================================================
function resolveShortIds(mapping, state) {
  console.log('\n' + '='.repeat(70));
  console.log('FASE 1: Resolver IDs curtos no mapping');
  console.log('='.repeat(70));

  const stateDetails = state.exam_details || {};

  // Build index: normalized patient name → full 24-char exam ID from state
  const stateByName = {};
  for (const [fullId, details] of Object.entries(stateDetails)) {
    const normalized = normalizeName(details.patient_name);
    if (!stateByName[normalized]) stateByName[normalized] = [];
    stateByName[normalized].push({ fullId, details });
  }

  let resolved = 0;
  let unresolved = 0;
  const unresolvedList = [];
  const changes = [];

  for (const [folderKey, entry] of Object.entries(mapping)) {
    if (entry.exam_id && entry.exam_id.length === 24) continue; // Already long ID

    const shortId = entry.exam_id || folderKey.split('_').pop();
    const nameNorm = normalizeName(entry.patient_name);

    // Find in state by matching name AND short ID prefix
    const candidates = stateByName[nameNorm] || [];
    const match = candidates.find(c => c.fullId.startsWith(shortId));

    if (match) {
      changes.push({
        folderKey,
        patientName: entry.patient_name,
        oldId: shortId,
        newId: match.fullId,
        stateData: match.details
      });
      resolved++;
    } else {
      unresolved++;
      unresolvedList.push({ folderKey, patientName: entry.patient_name, shortId });
    }
  }

  console.log(`  Resolvidos: ${resolved}`);
  console.log(`  Não resolvidos: ${unresolved}`);

  if (unresolvedList.length > 0) {
    console.log('\n  IDs não resolvidos:');
    unresolvedList.forEach(u => {
      console.log(`    ${u.patientName} | ${u.shortId}`);
    });
  }

  return { changes, unresolvedList };
}

// ============================================================
// FASE 3: Importar pacientes/exames faltantes para o DB
// ============================================================
async function importMissingData(mapping, state, execute) {
  console.log('\n' + '='.repeat(70));
  console.log('FASE 3: Importar pacientes/exames do mapping para o DB');
  console.log('='.repeat(70));

  const stateDetails = state.exam_details || {};

  // Group mapping entries by patient using normalized name only
  // (birthDate-based grouping creates too many groups for patients without birthDate)
  const patientGroups = {};

  for (const [folderKey, entry] of Object.entries(mapping)) {
    const name = entry.patient_name?.trim() || 'Desconhecido';
    const examId = entry.exam_id;

    // Skip entries without a valid long ID
    if (!examId || examId.length !== 24) {
      continue;
    }

    const nameNorm = normalizeName(name);

    if (!patientGroups[nameNorm]) {
      patientGroups[nameNorm] = {
        name,
        cpf: entry.cpf || null,
        birthDate: parseDate(entry.birthday),
        gender: entry.gender || null,
        underlyingDiseases: entry.underlying_diseases || null,
        ophthalmicDiseases: entry.ophthalmic_diseases || null,
        exams: []
      };
    } else {
      // Prefer non-null values
      const pg = patientGroups[nameNorm];
      if (!pg.cpf && entry.cpf) pg.cpf = entry.cpf;
      if (!pg.birthDate && entry.birthday) pg.birthDate = parseDate(entry.birthday);
      if (!pg.gender && entry.gender) pg.gender = entry.gender;
      if (!pg.underlyingDiseases && entry.underlying_diseases) pg.underlyingDiseases = entry.underlying_diseases;
      if (!pg.ophthalmicDiseases && entry.ophthalmic_diseases) pg.ophthalmicDiseases = entry.ophthalmic_diseases;
    }

    // Enrich with state data if available
    const stateData = stateDetails[examId];
    if (stateData) {
      const pg = patientGroups[nameNorm];
      if (!pg.cpf && stateData.cpf) pg.cpf = stateData.cpf;
      if (!pg.birthDate && stateData.birthday) pg.birthDate = parseDate(stateData.birthday);
      if (!pg.gender && stateData.gender) pg.gender = stateData.gender;
      if (!pg.underlyingDiseases && stateData.underlying_diseases) pg.underlyingDiseases = stateData.underlying_diseases;
      if (!pg.ophthalmicDiseases && stateData.ophthalmic_diseases) pg.ophthalmicDiseases = stateData.ophthalmic_diseases;
    }

    // Avoid duplicate exam entries (same examId from different mapping folders)
    if (!patientGroups[nameNorm].exams.some(e => e.examId === examId)) {
      patientGroups[nameNorm].exams.push({
        examId,
        examDate: parseDate(entry.exam_date || stateData?.exam_date) || new Date(),
        location: entry.clinic_name || stateData?.clinic_name || 'EyerCloud',
        technicianName: 'EyerCloud Sync',
        images: entry.images || []
      });
    }
  }

  const groups = Object.values(patientGroups);
  console.log(`  Pacientes únicos no mapping (com ID longo): ${groups.length}`);
  console.log(`  Exames únicos no mapping: ${groups.reduce((s, g) => s + g.exams.length, 0)}`);

  // Build DB lookup: normalized name → patient record
  const existingPatients = await prisma.patient.findMany({
    select: { id: true, name: true },
  });
  const dbNameToPatient = {};
  for (const p of existingPatients) {
    dbNameToPatient[normalizeName(p.name)] = p;
  }

  const existingExams = await prisma.exam.findMany({
    select: { id: true, eyerCloudId: true, patientId: true },
  });
  const existingExamIds = new Set(existingExams.map(e => e.id));

  const existingImages = await prisma.examImage.findMany({
    select: { id: true, url: true, examId: true },
  });
  const existingImageUrls = new Map();
  for (const img of existingImages) {
    if (!existingImageUrls.has(img.examId)) existingImageUrls.set(img.examId, new Set());
    existingImageUrls.get(img.examId).add(img.url);
  }

  let newPatients = 0;
  let updatedPatients = 0;
  let newExams = 0;
  let newImages = 0;
  let skippedImages = 0;

  for (const group of groups) {
    const nameNorm = normalizeName(group.name);
    const dbPatient = dbNameToPatient[nameNorm];
    // If patient exists in DB, use existing ID; otherwise use first exam ID
    const patientId = dbPatient ? dbPatient.id : group.exams[0].examId;

    if (!dbPatient) newPatients++;
    else updatedPatients++;

    for (const exam of group.exams) {
      if (!existingExamIds.has(exam.examId)) {
        newExams++;
      }

      const existingUrls = existingImageUrls.get(exam.examId) || new Set();
      for (const img of exam.images) {
        if (!img.bytescale_url) continue;
        if (existingUrls.has(img.bytescale_url)) {
          skippedImages++;
        } else {
          newImages++;
        }
      }
    }
  }

  console.log(`  Pacientes novos a criar: ${newPatients}`);
  console.log(`  Pacientes existentes a atualizar: ${updatedPatients}`);
  console.log(`  Exames novos a criar: ${newExams}`);
  console.log(`  Imagens novas a criar: ${newImages}`);
  console.log(`  Imagens existentes (skip): ${skippedImages}`);

  if (!execute) return { newPatients, newExams, groups };

  // Execute imports
  console.log('\n  Executando importação...');
  let processedCount = 0;
  let errors = [];

  for (const group of groups) {
    processedCount++;
    if (processedCount % 50 === 0) {
      console.log(`  Processados: ${processedCount}/${groups.length}...`);
    }

    try {
      const nameNorm = normalizeName(group.name);
      // Re-fetch current DB patient by name (may have been updated by Phase 2/migration)
      const dbMatches = await prisma.patient.findMany({
        where: { name: { mode: 'insensitive', equals: group.name } }
      });
      // Also try normalized match
      let dbPatient = dbMatches[0] || null;
      if (!dbPatient) {
        const allPatients = await prisma.patient.findMany({ select: { id: true, name: true } });
        dbPatient = allPatients.find(p => normalizeName(p.name) === nameNorm) || null;
      }

      const patientId = dbPatient ? dbPatient.id : group.exams[0].examId;

      // Upsert patient
      await prisma.patient.upsert({
        where: { id: patientId },
        update: {
          name: group.name,
          ...(group.cpf ? { cpf: group.cpf } : {}),
          ...(group.birthDate ? { birthDate: group.birthDate } : {}),
          ...(group.gender ? { gender: group.gender } : {}),
          ...(group.underlyingDiseases ? { underlyingDiseases: group.underlyingDiseases } : {}),
          ...(group.ophthalmicDiseases ? { ophthalmicDiseases: group.ophthalmicDiseases } : {}),
          updatedAt: new Date(),
        },
        create: {
          id: patientId,
          name: group.name,
          cpf: group.cpf,
          birthDate: group.birthDate,
          gender: group.gender,
          underlyingDiseases: group.underlyingDiseases,
          ophthalmicDiseases: group.ophthalmicDiseases,
          updatedAt: new Date(),
        }
      });

      // Upsert exams
      for (const exam of group.exams) {
        await prisma.exam.upsert({
          where: { id: exam.examId },
          update: {
            examDate: exam.examDate,
            location: exam.location,
            patientId: patientId,
            updatedAt: new Date(),
          },
          create: {
            id: exam.examId,
            eyerCloudId: exam.examId,
            examDate: exam.examDate,
            location: exam.location,
            technicianName: exam.technicianName,
            status: 'pending',
            patientId: patientId,
            updatedAt: new Date(),
          }
        });

        // Create images (skip existing by URL)
        const existingUrls = existingImageUrls.get(exam.examId) || new Set();
        for (const img of exam.images) {
          if (!img.bytescale_url) continue;
          if (existingUrls.has(img.bytescale_url)) continue;

          const imgId = `img-${img.filename || img.bytescale_url.split('/').pop().split('?')[0]}`;

          // Determine image type: use mapping type if COLOR/ANTERIOR, otherwise default to COLOR
          let imgType = img.type;
          if (!imgType || imgType === 'UNKNOWN') {
            imgType = 'COLOR'; // Default - retinal fundus is most common
          }

          try {
            await prisma.examImage.upsert({
              where: { id: imgId },
              update: {
                url: img.bytescale_url,
                fileName: img.filename || 'image.jpg',
                type: imgType,
                examId: exam.examId,
              },
              create: {
                id: imgId,
                url: img.bytescale_url,
                fileName: img.filename || 'image.jpg',
                type: imgType,
                examId: exam.examId,
                uploadedAt: img.upload_date ? new Date(img.upload_date) : new Date(),
              }
            });
          } catch (imgErr) {
            // Image ID collision - try with unique suffix
            try {
              const uniqueId = `img-${exam.examId.substring(0, 8)}-${img.filename || Math.random().toString(36).substring(2, 8)}`;
              await prisma.examImage.create({
                data: {
                  id: uniqueId,
                  url: img.bytescale_url,
                  fileName: img.filename || 'image.jpg',
                  type: imgType,
                  examId: exam.examId,
                  uploadedAt: img.upload_date ? new Date(img.upload_date) : new Date(),
                }
              });
            } catch (imgErr2) {
              // Skip - likely duplicate
            }
          }
        }
      }
    } catch (err) {
      errors.push({ name: group.name, error: err.message });
    }
  }

  if (errors.length > 0) {
    console.log(`\n  Erros (${errors.length}):`);
    errors.forEach(e => console.log(`    ${e.name}: ${e.error}`));
  }

  return { newPatients, newExams, groups, errors };
}

// ============================================================
// FASE 3: Corrigir pacientes com IDs curtos no DB
// ============================================================
async function fixShortIdPatients(resolvedChanges, execute) {
  console.log('\n' + '='.repeat(70));
  console.log('FASE 2: Corrigir pacientes com IDs curtos no DB');
  console.log('='.repeat(70));

  // Find patients in DB with short IDs (8 hex chars)
  const allPatients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: true,
          report: true,
          referral: true,
        }
      }
    }
  });

  const shortIdPatients = allPatients.filter(p => /^[a-f0-9]{8}$/.test(p.id));
  console.log(`  Pacientes com ID curto no DB: ${shortIdPatients.length}`);

  if (shortIdPatients.length === 0) {
    console.log('  Nenhum paciente com ID curto. Nada a fazer.');
    return;
  }

  // Build lookup from resolved changes: patient name → new long ID
  const nameToLongId = {};
  for (const change of resolvedChanges) {
    const nameNorm = normalizeName(change.patientName);
    nameToLongId[nameNorm] = change.newId;
  }

  let migrated = 0;
  let protectedExams = 0;
  let migratedExams = 0;
  const migrationPlan = [];

  for (const patient of shortIdPatients) {
    const nameNorm = normalizeName(patient.name);
    const newPatientId = nameToLongId[nameNorm];

    if (!newPatientId) {
      console.log(`  SKIP: ${patient.name} (${patient.id}) - sem ID longo resolvido`);
      continue;
    }

    // Check if new patient ID already exists (created in Phase 2)
    const existingNew = allPatients.find(p => p.id === newPatientId);

    const hasReports = patient.exams.some(e => e.report);
    const hasReferrals = patient.exams.some(e => e.referral);

    migrationPlan.push({
      oldId: patient.id,
      newId: newPatientId,
      name: patient.name,
      examCount: patient.exams.length,
      hasReports,
      hasReferrals,
      imageCount: patient.exams.reduce((sum, e) => sum + e.images.length, 0),
      targetExists: !!existingNew,
    });

    console.log(`  ${patient.name}: ${patient.id} → ${newPatientId} (${patient.exams.length} exames, reports: ${hasReports}, target exists: ${!!existingNew})`);
  }

  if (!execute) {
    console.log(`\n  Plan: ${migrationPlan.length} pacientes a migrar`);
    return;
  }

  // Execute migration
  for (const plan of migrationPlan) {
    try {
      const oldPatient = await prisma.patient.findUnique({
        where: { id: plan.oldId },
        include: {
          exams: {
            include: { images: true, report: true, referral: true }
          }
        }
      });

      if (!oldPatient) continue;

      await prisma.$transaction(async (tx) => {
        // Ensure target patient exists
        await tx.patient.upsert({
          where: { id: plan.newId },
          update: {
            // Preserve existing data, update with any non-null values from old
            ...(oldPatient.cpf && oldPatient.cpf !== 'PENDENTE' ? { cpf: oldPatient.cpf } : {}),
            ...(oldPatient.birthDate ? { birthDate: oldPatient.birthDate } : {}),
            ...(oldPatient.gender ? { gender: oldPatient.gender } : {}),
            ...(oldPatient.phone ? { phone: oldPatient.phone } : {}),
            ...(oldPatient.underlyingDiseases ? { underlyingDiseases: oldPatient.underlyingDiseases } : {}),
            ...(oldPatient.ophthalmicDiseases ? { ophthalmicDiseases: oldPatient.ophthalmicDiseases } : {}),
            updatedAt: new Date(),
          },
          create: {
            id: plan.newId,
            name: oldPatient.name,
            cpf: oldPatient.cpf,
            birthDate: oldPatient.birthDate,
            gender: oldPatient.gender,
            phone: oldPatient.phone,
            education: oldPatient.education,
            ethnicity: oldPatient.ethnicity,
            occupation: oldPatient.occupation,
            underlyingDiseases: oldPatient.underlyingDiseases,
            ophthalmicDiseases: oldPatient.ophthalmicDiseases,
            updatedAt: new Date(),
          }
        });

        // Move all exams to the new patient
        for (const exam of oldPatient.exams) {
          await tx.exam.update({
            where: { id: exam.id },
            data: { patientId: plan.newId }
          });
          migratedExams++;
        }

        // Delete old patient (now has no exams)
        await tx.patient.delete({ where: { id: plan.oldId } });
      });

      migrated++;
      console.log(`  Migrado: ${plan.name} (${plan.oldId} → ${plan.newId})`);
    } catch (err) {
      console.log(`  ERRO migrando ${plan.name}: ${err.message}`);
    }
  }

  console.log(`\n  Total migrados: ${migrated}`);
  console.log(`  Total exames movidos: ${migratedExams}`);
}

// ============================================================
// FASE 4: Importar exames do state que não estão no mapping
// ============================================================
async function importFromState(state, mapping, execute) {
  console.log('\n' + '='.repeat(70));
  console.log('FASE 4: Importar exames do state que faltam no DB');
  console.log('='.repeat(70));

  const stateDetails = state.exam_details || {};

  // Get all long IDs already in mapping
  const mappingLongIds = new Set();
  for (const entry of Object.values(mapping)) {
    if (entry.exam_id && entry.exam_id.length === 24) {
      mappingLongIds.add(entry.exam_id);
    }
  }

  // Get all exam IDs in DB
  const dbExams = await prisma.exam.findMany({ select: { id: true, eyerCloudId: true } });
  const dbExamIds = new Set(dbExams.map(e => e.id));
  const dbEyerCloudIds = new Set(dbExams.filter(e => e.eyerCloudId).map(e => e.eyerCloudId));

  // Find state exams not in DB
  const missingFromDb = [];
  for (const [examId, details] of Object.entries(stateDetails)) {
    if (details.patient_name === 'Desconhecido') continue;
    if (dbExamIds.has(examId) || dbEyerCloudIds.has(examId)) continue;
    missingFromDb.push({ examId, details });
  }

  console.log(`  Exames no state: ${Object.keys(stateDetails).length}`);
  console.log(`  Exames no state mas NÃO no DB: ${missingFromDb.length}`);

  if (missingFromDb.length === 0) {
    console.log('  Tudo sincronizado!');
    return;
  }

  // Group by patient name
  const byPatient = {};
  for (const { examId, details } of missingFromDb) {
    const nameNorm = normalizeName(details.patient_name);
    if (!byPatient[nameNorm]) {
      byPatient[nameNorm] = { name: details.patient_name, exams: [] };
    }
    byPatient[nameNorm].exams.push({ examId, details });
  }

  console.log(`  Pacientes com exames faltantes: ${Object.keys(byPatient).length}`);
  console.log('\n  Detalhes:');
  for (const [nameNorm, data] of Object.entries(byPatient)) {
    for (const { examId, details } of data.exams) {
      console.log(`    ${data.name} | ${examId} | ${details.clinic_name || 'N/A'} | expected: ${details.expected_images} imgs`);
    }
  }

  if (!execute) return;

  // Import missing exams (without images - images need to be downloaded separately)
  let created = 0;
  for (const [nameNorm, data] of Object.entries(byPatient)) {
    for (const { examId, details } of data.exams) {
      try {
        // Find or create patient
        // Look for existing patient by name
        const existingPatients = await prisma.patient.findMany({
          where: { name: { contains: data.name.substring(0, 10), mode: 'insensitive' } }
        });

        // Try exact normalized match
        let patientId = null;
        for (const ep of existingPatients) {
          if (normalizeName(ep.name) === nameNorm) {
            patientId = ep.id;
            break;
          }
        }

        if (!patientId) {
          // Create new patient with exam ID as patient ID
          patientId = examId;
          await prisma.patient.create({
            data: {
              id: patientId,
              name: data.name,
              cpf: details.cpf || null,
              birthDate: parseDate(details.birthday),
              gender: details.gender || null,
              underlyingDiseases: details.underlying_diseases || null,
              ophthalmicDiseases: details.ophthalmic_diseases || null,
              updatedAt: new Date(),
            }
          });
        }

        // Create exam
        await prisma.exam.create({
          data: {
            id: examId,
            eyerCloudId: examId,
            examDate: parseDate(details.exam_date) || new Date(),
            location: details.clinic_name || 'EyerCloud',
            technicianName: 'EyerCloud Sync',
            status: 'pending',
            patientId,
            updatedAt: new Date(),
          }
        });

        created++;
        console.log(`  Criado: ${data.name} | ${examId}`);
      } catch (err) {
        console.log(`  ERRO: ${data.name} | ${examId}: ${err.message}`);
      }
    }
  }

  console.log(`\n  Exames criados do state: ${created}`);
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log('='.repeat(70));
  console.log('SYNC EYERCLOUD → NEUROAPP DB');
  console.log('='.repeat(70));

  const execute = process.argv.includes('--execute');
  if (!execute) {
    console.log('MODO PREVIEW - use --execute para aplicar mudanças\n');
  } else {
    console.log('MODO EXECUÇÃO - mudanças serão aplicadas!\n');
  }

  const mapping = loadJSON(MAPPING_PATH);
  const state = loadJSON(STATE_PATH);

  console.log(`Mapping: ${Object.keys(mapping).length} entradas`);
  console.log(`State: ${Object.keys(state.exam_details || {}).length} exames`);

  // Count current DB state
  const dbPatients = await prisma.patient.count();
  const dbExams = await prisma.exam.count();
  const dbImages = await prisma.examImage.count();
  const dbReports = await prisma.medicalReport.count();
  console.log(`DB atual: ${dbPatients} pacientes, ${dbExams} exames, ${dbImages} imagens, ${dbReports} laudos`);

  // FASE 1: Resolver IDs curtos
  const { changes: resolvedChanges, unresolvedList } = resolveShortIds(mapping, state);

  // Apply resolved IDs to mapping (in memory)
  if (resolvedChanges.length > 0) {
    console.log(`\n  Aplicando ${resolvedChanges.length} IDs resolvidos ao mapping...`);
    for (const change of resolvedChanges) {
      mapping[change.folderKey].exam_id = change.newId;
      // Also enrich with state data
      if (change.stateData) {
        const entry = mapping[change.folderKey];
        if (!entry.birthday && change.stateData.birthday) entry.birthday = change.stateData.birthday;
        if (!entry.cpf && change.stateData.cpf) entry.cpf = change.stateData.cpf;
        if (!entry.gender && change.stateData.gender) entry.gender = change.stateData.gender;
        if (!entry.exam_date && change.stateData.exam_date) entry.exam_date = change.stateData.exam_date;
        if ((!entry.clinic_name || entry.clinic_name === 'Phelcom EyeR Cloud') && change.stateData.clinic_name) {
          entry.clinic_name = change.stateData.clinic_name;
        }
        if (!entry.underlying_diseases && change.stateData.underlying_diseases) {
          entry.underlying_diseases = change.stateData.underlying_diseases;
        }
        if (!entry.ophthalmic_diseases && change.stateData.ophthalmic_diseases) {
          entry.ophthalmic_diseases = change.stateData.ophthalmic_diseases;
        }
      }
    }

    if (execute) {
      saveJSON(MAPPING_PATH, mapping);
      console.log('  Mapping salvo!');
    }
  }

  // Recount unique exams after resolution
  const uniqueExamIds = new Set();
  const uniquePatientNames = new Set();
  let stillShort = 0;
  for (const entry of Object.values(mapping)) {
    uniqueExamIds.add(entry.exam_id);
    uniquePatientNames.add(normalizeName(entry.patient_name));
    if (entry.exam_id && entry.exam_id.length !== 24) stillShort++;
  }
  console.log(`\n  Após resolução:`);
  console.log(`    Exames únicos no mapping: ${uniqueExamIds.size}`);
  console.log(`    Pacientes únicos: ${uniquePatientNames.size}`);
  console.log(`    Ainda com ID curto: ${stillShort}`);

  // FASE 2: Corrigir IDs curtos no DB (ANTES de importar, para evitar duplicatas)
  await fixShortIdPatients(resolvedChanges, execute);

  // FASE 3: Importar pacientes/exames do mapping para o DB
  const importResult = await importMissingData(mapping, state, execute);

  // FASE 4: Importar exames do state não presentes no mapping/DB
  await importFromState(state, mapping, execute);

  // FASE 5: Reclassificar imagens UNKNOWN → COLOR
  console.log('\n' + '='.repeat(70));
  console.log('FASE 5: Reclassificar imagens UNKNOWN como COLOR');
  console.log('='.repeat(70));

  const unknownCount = await prisma.examImage.count({ where: { type: 'UNKNOWN' } });
  const nullTypeCount = await prisma.examImage.count({ where: { type: null } });
  console.log(`  Imagens UNKNOWN: ${unknownCount}`);
  console.log(`  Imagens sem tipo (NULL): ${nullTypeCount}`);

  if (execute && (unknownCount > 0 || nullTypeCount > 0)) {
    const updated1 = await prisma.examImage.updateMany({
      where: { type: 'UNKNOWN' },
      data: { type: 'COLOR' }
    });
    const updated2 = await prisma.examImage.updateMany({
      where: { type: null },
      data: { type: 'COLOR' }
    });
    console.log(`  Reclassificadas: ${updated1.count + updated2.count} imagens → COLOR`);
  }

  // Final report
  console.log('\n' + '='.repeat(70));
  console.log('RELATÓRIO FINAL');
  console.log('='.repeat(70));

  const finalPatients = await prisma.patient.count();
  const finalExams = await prisma.exam.count();
  const finalImages = await prisma.examImage.count();
  const finalReports = await prisma.medicalReport.count();

  console.log(`  Antes:  ${dbPatients} pacientes, ${dbExams} exames, ${dbImages} imagens, ${dbReports} laudos`);
  console.log(`  Depois: ${finalPatients} pacientes, ${finalExams} exames, ${finalImages} imagens, ${finalReports} laudos`);
  console.log(`  Target: 451 pacientes, 456 exames`);
  console.log(`  Delta:  ${451 - finalPatients} pacientes, ${456 - finalExams} exames faltando`);

  if (finalReports !== dbReports) {
    console.log(`  ALERTA: Laudos mudaram de ${dbReports} para ${finalReports}!`);
  } else {
    console.log(`  Laudos preservados: ${finalReports}`);
  }

  // Check for remaining short IDs
  const shortIdCount = await prisma.patient.count({
    where: {
      id: { not: { contains: '-' } },
      AND: { id: { not: { startsWith: 'manual' } } }
    }
  });

  // Actually count properly with raw query
  const shortIdPatients = await prisma.$queryRaw`
    SELECT COUNT(*) as count FROM "Patient" WHERE LENGTH(id) < 24
  `;
  console.log(`  Pacientes com ID curto restantes: ${shortIdPatients[0].count}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('ERRO FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});
