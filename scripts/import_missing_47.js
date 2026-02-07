/**
 * import_missing_47.js - Import 47 missing patients (48 exams) into the DB
 * =========================================================================
 *
 * Reads from:
 * - missing_47_patients.json (exam IDs and patient names)
 * - bytescale_mapping_v2.json (Bytescale image URLs)
 * - download_state.json (patient metadata + image types)
 *
 * Creates:
 * - Patient records (47 new, grouped by normalized name)
 * - Exam records (48 new)
 * - ExamImage records (only COLOR + ANTERIOR)
 *
 * Usage:
 *   node scripts/import_missing_47.js              # Preview (default)
 *   node scripts/import_missing_47.js --execute    # Apply changes
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');

console.log(execute ? '=== MODO EXECUCAO ===' : '=== MODO PREVIEW ===');

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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

async function main() {
  // Load data sources
  const missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'missing_47_patients.json'), 'utf8'));
  const mappingV2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader', 'download_state.json'), 'utf8'));

  console.log('Data sources loaded:');
  console.log('  Missing patients:', missing.patients.length);
  console.log('  Mapping V2 entries:', Object.keys(mappingV2).length);
  console.log('  State entries:', Object.keys(state.exam_details).length);

  // Group patients by normalized name (deduplication)
  const patientGroups = {};
  for (const p of missing.patients) {
    const norm = normalize(p.name);
    if (!patientGroups[norm]) {
      patientGroups[norm] = { name: p.name, exams: [] };
    }
    patientGroups[norm].exams.push(p);
  }

  console.log(`\nPatient groups: ${Object.keys(patientGroups).length} (from ${missing.patients.length} entries)`);

  // Check for existing patients in DB with same names
  const existingPatients = await prisma.patient.findMany({ select: { id: true, name: true } });
  const existingByNorm = {};
  for (const p of existingPatients) {
    existingByNorm[normalize(p.name)] = p;
  }

  // Check for existing exams
  const existingExams = await prisma.exam.findMany({ select: { id: true } });
  const existingExamIds = new Set(existingExams.map(e => e.id));

  let patientsToCreate = 0;
  let examsToCreate = 0;
  let imagesToCreate = 0;
  let skippedExams = 0;
  let skippedPatients = 0;

  const operations = []; // { type, data }

  for (const [norm, group] of Object.entries(patientGroups)) {
    const firstExam = group.exams[0];
    const examId = firstExam.examId;

    // Check if patient already exists in DB
    const existingPatient = existingByNorm[norm];
    if (existingPatient) {
      console.log(`  SKIP patient (exists): ${group.name} -> ${existingPatient.id}`);
      skippedPatients++;
    }

    const patientId = existingPatient ? existingPatient.id : examId;

    // Get patient metadata from state
    const stateDetails = state.exam_details[examId] || {};
    const underlyingDiseases = stateDetails.underlying_diseases || {};
    const ophthalmicDiseases = stateDetails.ophthalmic_diseases || {};

    if (!existingPatient) {
      patientsToCreate++;
      operations.push({
        type: 'patient',
        data: {
          id: patientId,
          name: group.name,
          cpf: stateDetails.cpf || null,
          birthDate: parseDate(stateDetails.birthday),
          gender: stateDetails.gender || null,
          underlyingDiseases: Object.keys(underlyingDiseases).length > 0 ? underlyingDiseases : undefined,
          ophthalmicDiseases: Object.keys(ophthalmicDiseases).length > 0 ? ophthalmicDiseases : undefined,
          updatedAt: new Date()
        }
      });
      console.log(`  CREATE patient: ${group.name} (id: ${patientId})`);
    }

    // Create exams for this patient
    for (const exam of group.exams) {
      if (existingExamIds.has(exam.examId)) {
        console.log(`    SKIP exam (exists): ${exam.examId}`);
        skippedExams++;
        continue;
      }

      const examDetails = state.exam_details[exam.examId] || {};
      const folderName = examDetails.folder_name;

      // Find Bytescale images
      let mappingEntry = mappingV2[folderName];
      if (!mappingEntry) {
        // Try to find by exam ID prefix
        const safeName = exam.name.replace(/[<>:"/\\|?*]/g, '_').replace(/ /g, '_');
        const altKey = `${safeName}_${exam.examId.substring(0, 8)}`;
        mappingEntry = mappingV2[altKey];
      }

      if (!mappingEntry || !mappingEntry.images || mappingEntry.images.length === 0) {
        console.log(`    WARN: No Bytescale images for exam ${exam.examId} (folder: ${folderName})`);
        continue;
      }

      // Get real image types from download_state image_details
      const imageDetails = examDetails.image_details || [];
      const imageTypeMap = {};
      for (const img of imageDetails) {
        imageTypeMap[img.uuid] = img.type;
      }

      // Filter images: only COLOR and ANTERIOR
      const images = [];
      for (const img of mappingEntry.images) {
        const uuid = img.filename?.replace('.jpg', '') || '';
        const realType = imageTypeMap[uuid] || img.type || 'COLOR';

        // Skip REDFREE
        if (realType === 'REDFREE') continue;
        // Only keep COLOR and ANTERIOR
        if (realType !== 'COLOR' && realType !== 'ANTERIOR' && realType !== 'UNKNOWN') continue;

        images.push({
          uuid,
          url: img.bytescale_url,
          fileName: img.filename || `${uuid}.jpg`,
          type: realType === 'UNKNOWN' ? 'COLOR' : realType
        });
      }

      examsToCreate++;

      operations.push({
        type: 'exam',
        data: {
          id: exam.examId,
          eyerCloudId: exam.examId,
          examDate: parseDate(exam.date) || parseDate(examDetails.exam_date) || new Date(),
          location: examDetails.clinic_name || 'EyerCloud',
          technicianName: 'EyerCloud',
          status: 'pending',
          patientId: patientId,
          updatedAt: new Date()
        },
        images: images
      });

      imagesToCreate += images.length;
      console.log(`    CREATE exam: ${exam.examId} (${images.length} images: ${images.filter(i => i.type === 'COLOR').length} COLOR, ${images.filter(i => i.type === 'ANTERIOR').length} ANTERIOR)`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Patients to create: ${patientsToCreate} (skipped: ${skippedPatients})`);
  console.log(`Exams to create: ${examsToCreate} (skipped: ${skippedExams})`);
  console.log(`Images to create: ${imagesToCreate}`);

  if (!execute) {
    console.log('\nRun with --execute to apply changes.');
    await prisma.$disconnect();
    return;
  }

  // Execute operations
  console.log('\n=== EXECUTING ===');

  let createdPatients = 0;
  let createdExams = 0;
  let createdImages = 0;

  // First: create patients
  for (const op of operations.filter(o => o.type === 'patient')) {
    try {
      await prisma.patient.create({ data: op.data });
      createdPatients++;
      console.log(`  OK patient: ${op.data.name}`);
    } catch (err) {
      console.log(`  ERR patient ${op.data.name}: ${err.message}`);
    }
  }

  // Then: create exams and images
  for (const op of operations.filter(o => o.type === 'exam')) {
    try {
      await prisma.exam.create({ data: op.data });
      createdExams++;
      console.log(`  OK exam: ${op.data.id.substring(0, 16)}...`);

      // Create images for this exam (use full UUID as ID - never truncate)
      for (const img of op.images) {
        try {
          const imgId = `img-${img.uuid}`;
          await prisma.examImage.create({
            data: {
              id: imgId,
              url: img.url,
              fileName: img.fileName,
              type: img.type,
              examId: op.data.id
            }
          });
          createdImages++;
        } catch (imgErr) {
          console.log(`    ERR image ${img.uuid}: ${imgErr.message}`);
        }
      }
    } catch (err) {
      console.log(`  ERR exam ${op.data.id}: ${err.message}`);
    }
  }

  console.log('\n=== EXECUTION RESULTS ===');
  console.log(`Patients created: ${createdPatients}`);
  console.log(`Exams created: ${createdExams}`);
  console.log(`Images created: ${createdImages}`);

  // Final counts
  const finalPatients = await prisma.patient.count();
  const finalExams = await prisma.exam.count();
  const finalImages = await prisma.examImage.count();
  const finalReports = await prisma.medicalReport.count();

  console.log('\n=== FINAL DB STATE ===');
  console.log(`Patients: ${finalPatients}`);
  console.log(`Exams: ${finalExams}`);
  console.log(`Images: ${finalImages}`);
  console.log(`Reports: ${finalReports}`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('FATAL:', err);
  prisma.$disconnect();
});
