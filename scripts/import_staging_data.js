#!/usr/bin/env node
/**
 * Import staging data from JSON state file into the staging PostgreSQL database.
 *
 * Uses batch operations (createMany) for speed and connection stability.
 * Safe to re-run: uses skipDuplicates to avoid conflicts.
 *
 * Usage:
 *   node scripts/import_staging_data.js --source scripts/eyercloud_downloader/staging_state_mozaniareis.json
 *   node scripts/import_staging_data.js --source scripts/eyercloud_downloader/staging_state_mozaniareis.json --execute
 *   node scripts/import_staging_data.js --source scripts/eyercloud_downloader/staging_state_dramelinalannes_endocrino.json --execute
 *
 * Without --execute, runs in preview mode (read-only).
 */

require('dotenv').config({ path: __dirname + '/../prisma-staging/.env' });
const { PrismaClient } = require('.prisma/client-staging');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.STAGING_DATABASE_URL } },
});

// Source login mapping
const SOURCE_LOGINS = {
  'mozaniareis@usp.br': {
    clinicName: 'Pós-Doutorado',
    userName: 'Mozania Reis de Matos',
  },
  'dramelinalannes.endocrino@gmail.com': {
    clinicName: 'Campos do Jordão',
    userName: 'Melina Morais Lannes',
  },
};

const BATCH_SIZE = 500; // Records per batch insert

function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  // Try DD/MM/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  // Try ISO format
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

async function batchInsert(model, records, label) {
  if (records.length === 0) {
    console.log(`  ${label}: 0 records, nothing to do`);
    return 0;
  }

  let total = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const result = await model.createMany({
      data: batch,
      skipDuplicates: true,
    });
    total += result.count;
    console.log(`  ${label}: batch ${Math.floor(i/BATCH_SIZE)+1} - ${result.count} new (${Math.min(i + BATCH_SIZE, records.length)}/${records.length})`);
  }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  const execute = args.includes('--execute');
  const cleanFirst = args.includes('--clean'); // Delete existing data for this source first

  if (sourceIdx === -1 || !args[sourceIdx + 1]) {
    console.log('Usage: node scripts/import_staging_data.js --source <state_file.json> [--execute] [--clean]');
    process.exit(1);
  }

  const stateFile = path.resolve(args[sourceIdx + 1]);
  if (!fs.existsSync(stateFile)) {
    console.error(`File not found: ${stateFile}`);
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Import Staging Data (Batch Mode)`);
  console.log(`  Source: ${stateFile}`);
  console.log(`  Mode: ${execute ? '🔴 EXECUTE' : '🟢 PREVIEW (dry run)'}`);
  if (cleanFirst) console.log(`  ⚠️  CLEAN: Will delete existing data for this source first`);
  console.log(`${'='.repeat(60)}\n`);

  const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
  const email = state.email;

  if (!email || !SOURCE_LOGINS[email]) {
    console.error(`Unknown email: ${email}`);
    console.error(`Known emails: ${Object.keys(SOURCE_LOGINS).join(', ')}`);
    process.exit(1);
  }

  // Get or create SourceLogin
  let sourceLogin;
  if (execute) {
    sourceLogin = await prisma.sourceLogin.upsert({
      where: { email },
      update: {
        totalExams: Object.keys(state.exams || {}).length,
        totalPatients: Object.keys(state.patients || {}).length,
        fetchedAt: state.fetched_at ? new Date(state.fetched_at) : new Date(),
      },
      create: {
        email,
        ...SOURCE_LOGINS[email],
        totalExams: Object.keys(state.exams || {}).length,
        totalPatients: Object.keys(state.patients || {}).length,
        fetchedAt: state.fetched_at ? new Date(state.fetched_at) : new Date(),
      },
    });
    console.log(`SourceLogin: ${sourceLogin.id} (${email})\n`);

    // Clean existing data if requested
    if (cleanFirst) {
      console.log('Cleaning existing data...');
      // Delete in order: images -> exams -> patients (foreign key order)
      const delImages = await prisma.stagingExamImage.deleteMany({
        where: { exam: { sourceLoginId: sourceLogin.id } },
      });
      console.log(`  Deleted ${delImages.count} images`);
      const delExams = await prisma.stagingExam.deleteMany({
        where: { sourceLoginId: sourceLogin.id },
      });
      console.log(`  Deleted ${delExams.count} exams`);
      const delPatients = await prisma.stagingPatient.deleteMany({
        where: { sourceLoginId: sourceLogin.id },
      });
      console.log(`  Deleted ${delPatients.count} patients\n`);
    }
  } else {
    sourceLogin = await prisma.sourceLogin.findUnique({ where: { email } });
    if (!sourceLogin) {
      console.log(`SourceLogin for ${email} will be created on --execute`);
      sourceLogin = { id: 'preview-id' };
    } else {
      console.log(`SourceLogin: ${sourceLogin.id} (${email})\n`);
    }
  }

  // ===== Prepare patient records =====
  const patients = Object.values(state.patients || {});
  const validPatients = patients.filter(p => p.id && p.id.length >= 10);
  const patientRecords = validPatients.map(pat => ({
    id: pat.id,
    rawName: pat.rawName || '',
    normalizedName: pat.normalizedName || null,
    cpf: pat.cpf || null,
    gender: pat.gender || null,
    birthDate: parseDate(pat.birthday),
    phone: pat.phone || null,
    prontuario: pat.prontuario || null,
    cns: pat.cns || null,
    ophthalmicDiseases: pat.ophthalmicDiseases || null,
    underlyingDiseases: pat.underlyingDiseases || null,
    sourceLoginId: sourceLogin.id,
  }));

  console.log(`--- Phase 1: Patients ---`);
  console.log(`  Total: ${patients.length}, Valid: ${validPatients.length}, Invalid: ${patients.length - validPatients.length}`);

  // ===== Prepare exam records =====
  const exams = Object.values(state.exams || {});
  const nameToPatientId = {};
  for (const pat of validPatients) {
    if (pat.normalizedName && pat.id) {
      nameToPatientId[pat.normalizedName] = pat.id;
    }
  }
  const validPatientIds = new Set(validPatients.map(p => p.id));

  const examRecords = [];
  let examsNoPatient = 0;
  for (const exam of exams) {
    if (!exam.id || exam.id.length < 10) continue;

    let patientId = exam.patientId;
    if (!patientId || !validPatientIds.has(patientId)) {
      const normName = normalizeName(exam.patientName);
      patientId = nameToPatientId[normName] || null;
    }
    if (!patientId || !validPatientIds.has(patientId)) {
      examsNoPatient++;
      continue;
    }

    examRecords.push({
      id: exam.id,
      eyerCloudId: exam.id,
      examDate: parseDate(exam.examDate) || new Date(),
      location: exam.clinicName || null,
      technicianName: exam.technicianName || null,
      patientId,
      sourceLoginId: sourceLogin.id,
    });
  }

  console.log(`\n--- Phase 2: Exams ---`);
  console.log(`  Total: ${exams.length}, Valid: ${examRecords.length}, No patient: ${examsNoPatient}`);

  // ===== Prepare image records =====
  const examImages = state.exam_images || {};
  const validExamIds = new Set(examRecords.map(e => e.id));
  const imageRecords = [];
  let typeCounts = { COLOR: 0, ANTERIOR: 0, UNKNOWN: 0 };
  let imagesSkipped = 0;

  for (const [examId, images] of Object.entries(examImages)) {
    if (!validExamIds.has(examId)) continue;

    for (const img of (images || [])) {
      if (!img.uuid) {
        imagesSkipped++;
        continue;
      }

      const imgType = (img.type || 'UNKNOWN').toUpperCase();
      if (typeCounts[imgType] !== undefined) {
        typeCounts[imgType]++;
      } else {
        typeCounts['UNKNOWN']++;
      }

      imageRecords.push({
        id: `img-${img.uuid}.jpg`,
        url: img.url || '',
        fileName: `${img.uuid}.jpg`,
        type: imgType,
        eyerUuid: img.uuid,
        examId,
      });
    }
  }

  console.log(`\n--- Phase 3: Images ---`);
  console.log(`  Total: ${imageRecords.length}, Skipped (no uuid): ${imagesSkipped}`);
  console.log(`  Types: ${JSON.stringify(typeCounts)}`);

  // ===== Execute or preview =====
  if (!execute) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  PREVIEW SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`  Would import:`);
    console.log(`    ${patientRecords.length} patients`);
    console.log(`    ${examRecords.length} exams`);
    console.log(`    ${imageRecords.length} images`);
    console.log(`\n  ⚠️  PREVIEW MODE - no changes made.`);
    console.log(`  Run with --execute to import data.`);
    console.log(`  Run with --execute --clean to replace existing data.`);
    console.log(`${'='.repeat(60)}\n`);
    return;
  }

  // Execute batch inserts
  console.log(`\n--- Executing Batch Inserts ---\n`);

  const pCreated = await batchInsert(prisma.stagingPatient, patientRecords, 'Patients');
  const eCreated = await batchInsert(prisma.stagingExam, examRecords, 'Exams');
  const iCreated = await batchInsert(prisma.stagingExamImage, imageRecords, 'Images');

  // Verify counts in DB
  const dbCounts = {
    patients: await prisma.stagingPatient.count({ where: { sourceLoginId: sourceLogin.id } }),
    exams: await prisma.stagingExam.count({ where: { sourceLoginId: sourceLogin.id } }),
    images: await prisma.stagingExamImage.count({
      where: { exam: { sourceLoginId: sourceLogin.id } },
    }),
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  IMPORT COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Source: ${email} (${SOURCE_LOGINS[email].clinicName})`);
  console.log(`  New records inserted:`);
  console.log(`    Patients: ${pCreated}`);
  console.log(`    Exams:    ${eCreated}`);
  console.log(`    Images:   ${iCreated}`);
  console.log(`  DB totals for this source:`);
  console.log(`    Patients: ${dbCounts.patients}`);
  console.log(`    Exams:    ${dbCounts.exams}`);
  console.log(`    Images:   ${dbCounts.images}`);
  console.log(`${'='.repeat(60)}\n`);
}

main()
  .catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
