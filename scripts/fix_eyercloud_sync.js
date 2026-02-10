/**
 * fix_eyercloud_sync.js
 *
 * Applies EyerCloud data (download_state.json) to the database,
 * fixing all discrepancies found by compare_eyercloud_vs_db.js:
 *
 *   1. Gender mismatch (29 patients) - EyerCloud is correct, DB has displaced data
 *   2. CPF mismatch (48 patients) - EyerCloud is correct, DB has displaced data
 *   3. BirthDate mismatch (59 patients) - EyerCloud is correct, DB has displaced data
 *   4. Diseases missing (369 patients) - EyerCloud has flags, DB has all false
 *   5. Location clinic ID (19 exams) - Replace clinic ID with "Campos do Jordão-SP"
 *
 * Usage:
 *   node scripts/fix_eyercloud_sync.js           # preview only
 *   node scripts/fix_eyercloud_sync.js --execute  # apply changes
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

const CLINIC_ID_MAP = {
  '695e434f28b781ee6000d862': 'Campos do Jordão-SP',
};

function normalize(name) {
  if (!name) return '';
  return name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function isEmptyCpf(cpf) {
  if (!cpf) return true;
  if (cpf.trim() === '') return true;
  if (cpf.startsWith('AUTO-')) return true;
  if (cpf.startsWith('CONFLICT-')) return true;
  if (cpf === 'PENDENTE') return true;
  return false;
}

function hasDiseaseData(diseases) {
  if (!diseases) return false;
  if (typeof diseases !== 'object') return false;
  return Object.values(diseases).some(v => v === true);
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}`);
  console.log('');

  // Load EyerCloud data
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const stateRaw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const state = stateRaw.exam_details || stateRaw;

  // Load all patients from DB
  const dbPatients = await prisma.patient.findMany({
    include: {
      exams: {
        select: { id: true, eyerCloudId: true, location: true, examDate: true }
      }
    }
  });

  // Build lookup maps
  const dbByName = new Map();
  for (const p of dbPatients) {
    const norm = normalize(p.name);
    if (!dbByName.has(norm)) dbByName.set(norm, p);
  }

  // Collect all fixes
  const fixes = {
    gender: [],
    cpf: [],
    birthDate: [],
    diseases: [],
    location: [],
  };

  const processedPatients = new Set();

  for (const [examId, entry] of Object.entries(state)) {
    const patientName = entry.patient_name;
    if (!patientName) continue;
    const normName = normalize(patientName);

    // --- Location fixes (check every exam) ---
    let dbPatientForLoc = null;
    for (const p of dbPatients) {
      if (p.exams.some(e => e.eyerCloudId === examId || e.id === examId)) {
        dbPatientForLoc = p;
        break;
      }
    }
    if (!dbPatientForLoc) dbPatientForLoc = dbByName.get(normName);
    if (dbPatientForLoc) {
      for (const exam of dbPatientForLoc.exams) {
        if ((exam.eyerCloudId === examId || exam.id === examId) && /^[0-9a-f]{24}$/i.test(exam.location)) {
          const resolved = CLINIC_ID_MAP[exam.location] || 'Campos do Jordão-SP';
          fixes.location.push({
            name: patientName,
            examId: exam.id,
            oldLocation: exam.location,
            newLocation: resolved,
          });
        }
      }
    }

    // Skip patient-level checks if already processed
    if (processedPatients.has(normName)) continue;
    processedPatients.add(normName);

    // Find patient in DB
    let dbPatient = null;
    for (const p of dbPatients) {
      if (p.exams.some(e => e.eyerCloudId === examId || e.id === examId)) {
        dbPatient = p;
        break;
      }
    }
    if (!dbPatient) dbPatient = dbByName.get(normName);
    if (!dbPatient) continue;

    // --- Gender fix ---
    const ecGender = entry.gender && entry.gender.trim() !== '' ? entry.gender.trim() : null;
    const dbGender = dbPatient.gender && dbPatient.gender.trim() !== '' ? dbPatient.gender.trim() : null;

    if (ecGender && !dbGender) {
      // DB missing, EyerCloud has it
      fixes.gender.push({
        name: patientName,
        patientId: dbPatient.id,
        oldGender: dbGender,
        newGender: ecGender,
      });
    } else if (ecGender && dbGender && ecGender.toLowerCase() !== dbGender.toLowerCase() &&
               !(ecGender.toLowerCase() === 'male' && dbGender.toLowerCase() === 'm') &&
               !(ecGender.toLowerCase() === 'female' && dbGender.toLowerCase() === 'f') &&
               !(ecGender.toLowerCase() === 'm' && dbGender.toLowerCase() === 'male') &&
               !(ecGender.toLowerCase() === 'f' && dbGender.toLowerCase() === 'female')) {
      // Mismatch - EyerCloud is the source of truth
      fixes.gender.push({
        name: patientName,
        patientId: dbPatient.id,
        oldGender: dbGender,
        newGender: ecGender,
      });
    }

    // --- CPF fix ---
    const ecCpf = entry.cpf && entry.cpf.trim() !== '' ? entry.cpf.trim() : null;
    const dbCpfRaw = dbPatient.cpf;
    const dbCpfEmpty = isEmptyCpf(dbCpfRaw);

    if (ecCpf && dbCpfEmpty) {
      // DB missing, EyerCloud has it
      fixes.cpf.push({
        name: patientName,
        patientId: dbPatient.id,
        oldCpf: dbCpfRaw,
        newCpf: ecCpf,
      });
    } else if (ecCpf && !dbCpfEmpty) {
      const ecClean = ecCpf.replace(/\D/g, '');
      const dbClean = (dbCpfRaw || '').replace(/\D/g, '');
      if (ecClean !== dbClean && ecClean.length === 11) {
        // Mismatch - EyerCloud is the source of truth
        fixes.cpf.push({
          name: patientName,
          patientId: dbPatient.id,
          oldCpf: dbCpfRaw,
          newCpf: ecCpf,
        });
      }
    }

    // --- BirthDate fix ---
    const ecBday = entry.birthday && entry.birthday.trim() !== '' ? entry.birthday.trim() : null;
    const dbBday = dbPatient.birthDate;

    if (ecBday && !dbBday) {
      fixes.birthDate.push({
        name: patientName,
        patientId: dbPatient.id,
        oldBirthDate: null,
        newBirthDate: ecBday,
      });
    } else if (ecBday && dbBday) {
      const ecDate = new Date(ecBday);
      const dbDate = new Date(dbBday);
      const diffMs = Math.abs(ecDate.getTime() - dbDate.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 1) {
        fixes.birthDate.push({
          name: patientName,
          patientId: dbPatient.id,
          oldBirthDate: dbBday.toISOString().slice(0, 10),
          newBirthDate: ecBday,
          diffDays: Math.round(diffDays),
        });
      }
    }

    // --- Diseases fix ---
    const ecUnderlying = entry.underlying_diseases;
    const dbUnderlying = dbPatient.underlyingDiseases;
    const ecHasDisease = hasDiseaseData(ecUnderlying);
    const dbHasDisease = hasDiseaseData(dbUnderlying);

    if (ecHasDisease && !dbHasDisease) {
      // DB has all false, EyerCloud has flags
      fixes.diseases.push({
        name: patientName,
        patientId: dbPatient.id,
        field: 'underlyingDiseases',
        oldData: dbUnderlying,
        newData: ecUnderlying,
      });
    } else if (ecHasDisease && dbHasDisease) {
      // Check for new flags in EyerCloud not in DB
      const merged = { ...(dbUnderlying || {}), ...(ecUnderlying || {}) };
      let hasNew = false;
      for (const [key, val] of Object.entries(ecUnderlying || {})) {
        if (val === true && (!dbUnderlying || dbUnderlying[key] !== true)) {
          hasNew = true;
          break;
        }
      }
      if (hasNew) {
        fixes.diseases.push({
          name: patientName,
          patientId: dbPatient.id,
          field: 'underlyingDiseases (merge)',
          oldData: dbUnderlying,
          newData: merged,
        });
      }
    }

    // Ophthalmic diseases
    const ecOphthalmic = entry.ophthalmic_diseases;
    const dbOphthalmic = dbPatient.ophthalmicDiseases;
    const ecHasOph = hasDiseaseData(ecOphthalmic);
    const dbHasOph = hasDiseaseData(dbOphthalmic);

    if (ecHasOph && !dbHasOph) {
      fixes.diseases.push({
        name: patientName,
        patientId: dbPatient.id,
        field: 'ophthalmicDiseases',
        oldData: dbOphthalmic,
        newData: ecOphthalmic,
      });
    }
  }

  // --- Report ---
  console.log('=== FIX PLAN ===');
  console.log(`Gender fixes: ${fixes.gender.length}`);
  console.log(`CPF fixes: ${fixes.cpf.length}`);
  console.log(`BirthDate fixes: ${fixes.birthDate.length}`);
  console.log(`Disease fixes: ${fixes.diseases.length}`);
  console.log(`Location fixes: ${fixes.location.length}`);
  const total = fixes.gender.length + fixes.cpf.length + fixes.birthDate.length + fixes.diseases.length + fixes.location.length;
  console.log(`Total: ${total}`);
  console.log('');

  // Print details
  if (fixes.gender.length > 0) {
    console.log('--- GENDER ---');
    for (const f of fixes.gender) {
      console.log(`  ${f.name}: "${f.oldGender}" -> "${f.newGender}"`);
    }
    console.log('');
  }

  if (fixes.cpf.length > 0) {
    console.log('--- CPF ---');
    for (const f of fixes.cpf) {
      console.log(`  ${f.name}: "${f.oldCpf}" -> "${f.newCpf}"`);
    }
    console.log('');
  }

  if (fixes.birthDate.length > 0) {
    console.log('--- BIRTHDATE ---');
    for (const f of fixes.birthDate) {
      console.log(`  ${f.name}: ${f.oldBirthDate} -> ${f.newBirthDate}${f.diffDays ? ' (diff: ' + f.diffDays + ' days)' : ''}`);
    }
    console.log('');
  }

  if (fixes.diseases.length > 0) {
    console.log('--- DISEASES ---');
    for (const f of fixes.diseases) {
      const newFlags = Object.entries(f.newData || {}).filter(([k, v]) => v === true).map(([k]) => k);
      console.log(`  ${f.name} [${f.field}]: ${newFlags.join(', ')}`);
    }
    console.log('');
  }

  if (fixes.location.length > 0) {
    console.log('--- LOCATION ---');
    for (const f of fixes.location) {
      console.log(`  ${f.name} (exam: ${f.examId}): "${f.oldLocation}" -> "${f.newLocation}"`);
    }
    console.log('');
  }

  if (!EXECUTE) {
    console.log('Run with --execute to apply these changes.');
    return;
  }

  // --- Apply fixes ---
  console.log('=== APPLYING FIXES ===');
  let applied = 0;
  let errors = 0;

  // 1. Gender
  for (const f of fixes.gender) {
    try {
      await prisma.patient.update({
        where: { id: f.patientId },
        data: { gender: f.newGender },
      });
      applied++;
    } catch (e) {
      console.error(`  ERROR gender ${f.name}: ${e.message}`);
      errors++;
    }
  }
  console.log(`Gender: ${fixes.gender.length} applied`);

  // 2. CPF
  for (const f of fixes.cpf) {
    try {
      await prisma.patient.update({
        where: { id: f.patientId },
        data: { cpf: f.newCpf },
      });
      applied++;
    } catch (e) {
      console.error(`  ERROR cpf ${f.name}: ${e.message}`);
      errors++;
    }
  }
  console.log(`CPF: ${fixes.cpf.length} applied`);

  // 3. BirthDate
  for (const f of fixes.birthDate) {
    try {
      await prisma.patient.update({
        where: { id: f.patientId },
        data: { birthDate: new Date(f.newBirthDate) },
      });
      applied++;
    } catch (e) {
      console.error(`  ERROR birthDate ${f.name}: ${e.message}`);
      errors++;
    }
  }
  console.log(`BirthDate: ${fixes.birthDate.length} applied`);

  // 4. Diseases
  for (const f of fixes.diseases) {
    try {
      const field = f.field.startsWith('ophthalmic') ? 'ophthalmicDiseases' : 'underlyingDiseases';
      await prisma.patient.update({
        where: { id: f.patientId },
        data: { [field]: f.newData },
      });
      applied++;
    } catch (e) {
      console.error(`  ERROR diseases ${f.name}: ${e.message}`);
      errors++;
    }
  }
  console.log(`Diseases: ${fixes.diseases.length} applied`);

  // 5. Location - batch update by clinic ID
  const locationExamIds = fixes.location.map(f => f.examId);
  if (locationExamIds.length > 0) {
    try {
      const result = await prisma.exam.updateMany({
        where: { id: { in: locationExamIds } },
        data: { location: 'Campos do Jordão-SP' },
      });
      applied += result.count;
      console.log(`Location: ${result.count} exams updated`);
    } catch (e) {
      console.error(`  ERROR location batch: ${e.message}`);
      errors += locationExamIds.length;
    }
  }

  console.log('');
  console.log(`=== DONE: ${applied} applied, ${errors} errors ===`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
