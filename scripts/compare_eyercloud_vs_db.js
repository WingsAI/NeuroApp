/**
 * compare_eyercloud_vs_db.js
 *
 * Compares EyerCloud data (download_state.json) with the database
 * to find missing or outdated fields per patient.
 *
 * Fields compared:
 *   - gender (Patient.gender)
 *   - cpf (Patient.cpf)
 *   - birthDate (Patient.birthDate)
 *   - underlyingDiseases (Patient.underlyingDiseases)
 *   - ophthalmicDiseases (Patient.ophthalmicDiseases)
 *   - location (Exam.location) - detects clinic IDs not yet resolved
 *
 * Usage:
 *   node scripts/compare_eyercloud_vs_db.js           # full report
 *   node scripts/compare_eyercloud_vs_db.js --summary  # counts only
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const SUMMARY_ONLY = process.argv.includes('--summary');

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

function isClinicId(location) {
  if (!location) return false;
  return /^[0-9a-f]{24}$/i.test(location);
}

function hasDiseaseData(diseases) {
  if (!diseases) return false;
  if (typeof diseases !== 'object') return false;
  return Object.values(diseases).some(v => v === true);
}

async function main() {
  // Load download_state.json
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const stateRaw = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  // Handle both flat format and nested { exam_details: {...} } format
  const state = stateRaw.exam_details || stateRaw;

  // Load all patients from DB with their exams
  const dbPatients = await prisma.patient.findMany({
    include: {
      exams: {
        select: { id: true, eyerCloudId: true, location: true, examDate: true }
      }
    }
  });

  // Build lookup maps
  const dbById = new Map();
  const dbByName = new Map();
  for (const p of dbPatients) {
    dbById.set(p.id, p);
    const norm = normalize(p.name);
    if (!dbByName.has(norm)) dbByName.set(norm, p);
  }

  // Track issues
  const issues = {
    genderMissing: [],      // DB has no gender, EyerCloud has it
    genderMismatch: [],     // Both have gender but different
    cpfMissing: [],         // DB has no CPF, EyerCloud has it
    cpfMismatch: [],        // Both have CPF but different
    birthDateMissing: [],   // DB has no birthDate, EyerCloud has it
    birthDateMismatch: [],  // Both have birthDate but differ by >1 day
    diseasesNewInfo: [],    // EyerCloud has disease flags that DB doesn't
    locationClinicId: [],   // Exam location is still a clinic ID
    notInDb: [],            // Patient in EyerCloud but not found in DB at all
  };

  const processedPatients = new Set();

  for (const [examId, entry] of Object.entries(state)) {
    const patientName = entry.patient_name;
    if (!patientName) continue;
    const normName = normalize(patientName);

    // Skip if we already processed this patient (multiple exams)
    if (processedPatients.has(normName)) {
      // Still check location for this specific exam
      checkExamLocation(examId, entry, dbById, dbByName, issues);
      continue;
    }
    processedPatients.add(normName);

    // Find patient in DB
    let dbPatient = null;
    // Try by exam ID match
    for (const p of dbPatients) {
      if (p.id === examId || p.exams.some(e => e.eyerCloudId === examId || e.id === examId)) {
        dbPatient = p;
        break;
      }
    }
    // Fallback by name
    if (!dbPatient) {
      dbPatient = dbByName.get(normName);
    }

    if (!dbPatient) {
      issues.notInDb.push({ name: patientName, examId });
      continue;
    }

    // --- Gender comparison ---
    const ecGender = entry.gender && entry.gender.trim() !== '' ? entry.gender.trim() : null;
    const dbGender = dbPatient.gender && dbPatient.gender.trim() !== '' ? dbPatient.gender.trim() : null;

    if (ecGender && !dbGender) {
      issues.genderMissing.push({
        name: patientName,
        patientId: dbPatient.id,
        eyercloud: ecGender,
        db: dbGender,
      });
    } else if (ecGender && dbGender && ecGender.toLowerCase() !== dbGender.toLowerCase() &&
               !(ecGender.toLowerCase() === 'male' && dbGender.toLowerCase() === 'm') &&
               !(ecGender.toLowerCase() === 'female' && dbGender.toLowerCase() === 'f') &&
               !(ecGender.toLowerCase() === 'm' && dbGender.toLowerCase() === 'male') &&
               !(ecGender.toLowerCase() === 'f' && dbGender.toLowerCase() === 'female')) {
      issues.genderMismatch.push({
        name: patientName,
        patientId: dbPatient.id,
        eyercloud: ecGender,
        db: dbGender,
      });
    }

    // --- CPF comparison ---
    const ecCpf = entry.cpf && entry.cpf.trim() !== '' ? entry.cpf.trim() : null;
    const dbCpfRaw = dbPatient.cpf;
    const dbCpfEmpty = isEmptyCpf(dbCpfRaw);

    if (ecCpf && dbCpfEmpty) {
      issues.cpfMissing.push({
        name: patientName,
        patientId: dbPatient.id,
        eyercloud: ecCpf,
        db: dbCpfRaw,
      });
    } else if (ecCpf && !dbCpfEmpty) {
      const ecCpfClean = ecCpf.replace(/\D/g, '');
      const dbCpfClean = (dbCpfRaw || '').replace(/\D/g, '');
      if (ecCpfClean !== dbCpfClean && ecCpfClean.length === 11) {
        issues.cpfMismatch.push({
          name: patientName,
          patientId: dbPatient.id,
          eyercloud: ecCpf,
          db: dbCpfRaw,
        });
      }
    }

    // --- BirthDate comparison ---
    const ecBirthday = entry.birthday && entry.birthday.trim() !== '' ? entry.birthday.trim() : null;
    const dbBirthDate = dbPatient.birthDate;

    if (ecBirthday && !dbBirthDate) {
      issues.birthDateMissing.push({
        name: patientName,
        patientId: dbPatient.id,
        eyercloud: ecBirthday,
        db: null,
      });
    } else if (ecBirthday && dbBirthDate) {
      const ecDate = new Date(ecBirthday);
      const dbDate = new Date(dbBirthDate);
      const diffMs = Math.abs(ecDate.getTime() - dbDate.getTime());
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > 1) {
        issues.birthDateMismatch.push({
          name: patientName,
          patientId: dbPatient.id,
          eyercloud: ecBirthday,
          db: dbBirthDate.toISOString(),
          diffDays: Math.round(diffDays),
        });
      }
    }

    // --- Disease data comparison ---
    const ecUnderlying = entry.underlying_diseases;
    const dbUnderlying = dbPatient.underlyingDiseases;
    const ecHasDisease = hasDiseaseData(ecUnderlying);
    const dbHasDisease = hasDiseaseData(dbUnderlying);

    if (ecHasDisease && !dbHasDisease) {
      issues.diseasesNewInfo.push({
        name: patientName,
        patientId: dbPatient.id,
        field: 'underlyingDiseases',
        eyercloud: ecUnderlying,
        db: dbUnderlying,
      });
    } else if (ecHasDisease && dbHasDisease) {
      // Check if EyerCloud has flags that DB doesn't
      const newFlags = {};
      let hasNew = false;
      for (const [key, val] of Object.entries(ecUnderlying)) {
        if (val === true && (!dbUnderlying || dbUnderlying[key] !== true)) {
          newFlags[key] = true;
          hasNew = true;
        }
      }
      if (hasNew) {
        issues.diseasesNewInfo.push({
          name: patientName,
          patientId: dbPatient.id,
          field: 'underlyingDiseases (partial)',
          eyercloud: ecUnderlying,
          db: dbUnderlying,
          newFlags,
        });
      }
    }

    // Ophthalmic diseases
    const ecOphthalmic = entry.ophthalmic_diseases;
    const dbOphthalmic = dbPatient.ophthalmicDiseases;
    const ecHasOph = hasDiseaseData(ecOphthalmic);
    const dbHasOph = hasDiseaseData(dbOphthalmic);

    if (ecHasOph && !dbHasOph) {
      issues.diseasesNewInfo.push({
        name: patientName,
        patientId: dbPatient.id,
        field: 'ophthalmicDiseases',
        eyercloud: ecOphthalmic,
        db: dbOphthalmic,
      });
    }

    // Check exam location
    checkExamLocation(examId, entry, dbById, dbByName, issues);
  }

  // --- Report ---
  console.log('=== EyerCloud vs DB Comparison ===');
  console.log(`Patients in EyerCloud: ${processedPatients.size}`);
  console.log(`Patients in DB: ${dbPatients.length}`);
  console.log('');

  printSection('GENDER: Missing in DB (EyerCloud has data)', issues.genderMissing);
  printSection('GENDER: Mismatch', issues.genderMismatch);
  printSection('CPF: Missing in DB (EyerCloud has data)', issues.cpfMissing);
  printSection('CPF: Mismatch', issues.cpfMismatch);
  printSection('BIRTHDATE: Missing in DB', issues.birthDateMissing);
  printSection('BIRTHDATE: Mismatch (>1 day diff)', issues.birthDateMismatch);
  printSection('DISEASES: New info in EyerCloud not in DB', issues.diseasesNewInfo);
  printSection('LOCATION: Still a clinic ID (not resolved)', issues.locationClinicId);
  printSection('NOT IN DB: Patients only in EyerCloud', issues.notInDb);

  // Summary
  console.log('\n=== SUMMARY ===');
  const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`Total discrepancies found: ${totalIssues}`);
  for (const [key, arr] of Object.entries(issues)) {
    if (arr.length > 0) {
      console.log(`  ${key}: ${arr.length}`);
    }
  }
}

function checkExamLocation(examId, entry, dbById, dbByName, issues) {
  // Find the exam in DB and check if location is a clinic ID
  const normName = normalize(entry.patient_name);
  let dbPatient = null;
  for (const [_, p] of dbById) {
    if (p.exams && p.exams.some(e => e.eyerCloudId === examId || e.id === examId)) {
      dbPatient = p;
      break;
    }
  }
  if (!dbPatient) dbPatient = dbByName.get(normName);
  if (!dbPatient) return;

  for (const exam of dbPatient.exams) {
    if ((exam.eyerCloudId === examId || exam.id === examId) && isClinicId(exam.location)) {
      // Determine correct location from exam date
      const examDate = exam.examDate || (entry.exam_date ? new Date(entry.exam_date) : null);
      let suggested = 'Unknown';
      if (examDate) {
        const d = new Date(examDate);
        const day = d.getUTCDate();
        const month = d.getUTCMonth() + 1;
        if (month === 1 && day <= 15) suggested = 'Tauá-CE';
        else if (month === 1 && day >= 27) suggested = 'Jaci-SP';
        else if (month === 2 && day >= 2 && day <= 6) suggested = 'Campos do Jordão-SP';
      }

      issues.locationClinicId.push({
        name: entry.patient_name,
        examId: exam.id,
        currentLocation: exam.location,
        suggested,
        examDate: examDate?.toISOString(),
      });
    }
  }
}

function printSection(title, items) {
  if (items.length === 0) {
    if (!SUMMARY_ONLY) console.log(`\n${title}: 0 (OK)`);
    return;
  }

  console.log(`\n${title}: ${items.length}`);
  if (SUMMARY_ONLY) return;

  for (const item of items) {
    if (item.name && item.eyercloud !== undefined) {
      console.log(`  ${item.name}`);
      console.log(`    EyerCloud: ${JSON.stringify(item.eyercloud)}`);
      console.log(`    DB:        ${JSON.stringify(item.db)}`);
      if (item.newFlags) console.log(`    New flags: ${JSON.stringify(item.newFlags)}`);
      if (item.diffDays) console.log(`    Diff: ${item.diffDays} days`);
    } else if (item.name && item.examId) {
      console.log(`  ${item.name} (exam: ${item.examId})`);
      if (item.currentLocation) console.log(`    Location: ${item.currentLocation} -> suggested: ${item.suggested}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
