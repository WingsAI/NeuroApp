#!/usr/bin/env node
/**
 * Import Dryur/EyerCloud March 23+ exams into the main NeuroApp database.
 *
 * Safety:
 * - Preview by default; --execute is required to write.
 * - Uses full EyerCloud patient.id and exam.id only. No name-based merge.
 * - Skips existing exams and existing images.
 * - Creates a pre-import DB snapshot when executing.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const prisma = new PrismaClient();

const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(__dirname, 'eyercloud_downloader', 'staging_state_dryurehermerson1.json');
const MAPPING_FILE = path.join(PROJECT_ROOT, 'bytescale_mapping_staging_dryurehermerson1.json');
const SOURCE_LABEL = 'dryurehermerson1@gmail.com 2026-03-23+';

function normalizeName(name) {
  return (name || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeGender(value) {
  const v = (value || '').trim().toLowerCase();
  if (v === 'f' || v === 'female' || v === 'feminino') return 'Feminino';
  if (v === 'm' || v === 'male' || v === 'masculino') return 'Masculino';
  return value || null;
}

function loadJson(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function buildImageUrlIndex(mapping) {
  const byExamUuid = new Map();
  const byUuid = new Map();
  for (const entry of Object.values(mapping)) {
    const examId = entry.exam_id;
    if (!examId) continue;
    for (const image of entry.images || []) {
      const uuid = image.uuid || (image.filename || '').replace(/\.[^.]+$/, '');
      if (!uuid) continue;
      const url = image.cdn_url || image.bytescale_url || '';
      const value = {
        url,
        filename: image.filename || `${uuid}.jpg`,
      };
      byExamUuid.set(`${examId}:${uuid}`, value);
      byUuid.set(uuid, value);
    }
  }
  return { byExamUuid, byUuid };
}

function buildRecords(state, mapping) {
  const imageUrlIndex = buildImageUrlIndex(mapping);
  const patients = Object.values(state.patients || {});
  const exams = Object.values(state.exams || {});
  const examImages = state.exam_images || {};

  const patientRecords = patients.map((pat) => ({
    id: pat.id,
    name: pat.rawName || '',
    cpf: pat.cpf || null,
    birthDate: parseDate(pat.birthday),
    gender: normalizeGender(pat.gender),
    phone: pat.phone || null,
    ophthalmicDiseases: pat.ophthalmicDiseases || null,
    underlyingDiseases: pat.underlyingDiseases || null,
    updatedAt: new Date(),
  }));

  const examRecords = exams.map((exam) => ({
    id: exam.id,
    eyerCloudId: exam.id,
    examDate: parseDate(exam.examDate) || new Date(),
    location: exam.clinicName || 'SEM CIDADE',
    technicianName: exam.technicianName || '',
    status: 'pending',
    patientId: exam.patientId,
    updatedAt: new Date(),
  }));

  const imageRecords = [];
  const missingUrls = [];
  for (const [examId, images] of Object.entries(examImages)) {
    for (const img of images || []) {
      const uuid = img.uuid;
      if (!uuid) continue;
      const found = imageUrlIndex.byExamUuid.get(`${examId}:${uuid}`) || imageUrlIndex.byUuid.get(uuid);
      if (!found || !found.url) {
        missingUrls.push({ examId, uuid });
        continue;
      }
      imageRecords.push({
        id: `img-${uuid}.jpg`,
        url: found.url,
        fileName: found.filename || `${uuid}.jpg`,
        type: (img.type || 'UNKNOWN').toUpperCase(),
        examId,
      });
    }
  }

  return { patientRecords, examRecords, imageRecords, missingUrls };
}

async function inspect(records) {
  const patientIds = records.patientRecords.map((p) => p.id);
  const examIds = records.examRecords.map((e) => e.id);
  const imageIds = records.imageRecords.map((i) => i.id);
  const names = records.patientRecords.map((p) => normalizeName(p.name)).filter(Boolean);

  const [
    existingPatients,
    existingExams,
    existingImages,
    sameNamePatients,
    dbCounts,
  ] = await Promise.all([
    prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, name: true, cpf: true, birthDate: true, gender: true, phone: true, ophthalmicDiseases: true, underlyingDiseases: true } }),
    prisma.exam.findMany({ where: { OR: [{ id: { in: examIds } }, { eyerCloudId: { in: examIds } }] }, select: { id: true, eyerCloudId: true, patientId: true, location: true } }),
    prisma.examImage.findMany({ where: { id: { in: imageIds } }, select: { id: true, examId: true } }),
    prisma.patient.findMany({ select: { id: true, name: true } }),
    Promise.all([
      prisma.patient.count(),
      prisma.exam.count(),
      prisma.examImage.count(),
      prisma.medicalReport.count(),
    ]),
  ]);

  const importPatientIds = new Set(patientIds);
  const sameNameWarnings = sameNamePatients
    .filter((p) => names.includes(normalizeName(p.name)) && !importPatientIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name }));

  return {
    existingPatients,
    existingExams,
    existingImages,
    sameNameWarnings,
    dbCounts: {
      patients: dbCounts[0],
      exams: dbCounts[1],
      images: dbCounts[2],
      reports: dbCounts[3],
    },
  };
}

function runSnapshot() {
  console.log('\n--- Creating pre-import DB snapshot ---');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'db_snapshot.js')], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Pre-import snapshot failed; aborting import.');
  }
}

function buildMissingPatientUpdate(existing, incoming) {
  const update = {};
  for (const key of ['cpf', 'birthDate', 'gender', 'phone', 'ophthalmicDiseases', 'underlyingDiseases']) {
    const current = existing[key];
    const next = incoming[key];
    if ((current === null || current === undefined || current === '') && next !== null && next !== undefined && next !== '') {
      update[key] = next;
    }
  }
  if (Object.keys(update).length > 0) {
    update.updatedAt = new Date();
  }
  return update;
}

async function executeImport(records, info) {
  runSnapshot();

  const existingPatientById = new Map(info.existingPatients.map((p) => [p.id, p]));
  const existingExamIds = new Set(info.existingExams.flatMap((e) => [e.id, e.eyerCloudId].filter(Boolean)));
  const existingImageIds = new Set(info.existingImages.map((i) => i.id));

  let patientsCreated = 0;
  let patientsUpdated = 0;
  let patientsSkipped = 0;

  for (const patient of records.patientRecords) {
    const existing = existingPatientById.get(patient.id);
    if (!existing) {
      await prisma.patient.create({ data: patient });
      patientsCreated++;
      continue;
    }
    const update = buildMissingPatientUpdate(existing, patient);
    if (Object.keys(update).length === 0) {
      patientsSkipped++;
      continue;
    }
    await prisma.patient.update({ where: { id: patient.id }, data: update });
    patientsUpdated++;
  }

  const examsToCreate = records.examRecords.filter((exam) => !existingExamIds.has(exam.id));
  const examResult = examsToCreate.length
    ? await prisma.exam.createMany({ data: examsToCreate, skipDuplicates: true })
    : { count: 0 };

  const validExamIds = new Set(records.examRecords.map((e) => e.id));
  const imagesToCreate = records.imageRecords.filter((img) => validExamIds.has(img.examId) && !existingImageIds.has(img.id));
  const imageResult = imagesToCreate.length
    ? await prisma.examImage.createMany({ data: imagesToCreate, skipDuplicates: true })
    : { count: 0 };

  return {
    patientsCreated,
    patientsUpdated,
    patientsSkipped,
    examsCreated: examResult.count,
    imagesCreated: imageResult.count,
  };
}

async function main() {
  const execute = process.argv.includes('--execute');
  const state = loadJson(STATE_FILE);
  const mapping = loadJson(MAPPING_FILE);
  const records = buildRecords(state, mapping);
  const info = await inspect(records);

  const uniquePatientIds = new Set(records.patientRecords.map((p) => p.id));
  const uniqueExamIds = new Set(records.examRecords.map((e) => e.id));
  const uniqueImageIds = new Set(records.imageRecords.map((i) => i.id));

  console.log('='.repeat(70));
  console.log(`Import ${SOURCE_LABEL} -> main DB`);
  console.log(`Mode: ${execute ? 'EXECUTE' : 'PREVIEW'}`);
  console.log('='.repeat(70));
  console.log(`Input patients: ${records.patientRecords.length} (${uniquePatientIds.size} unique IDs)`);
  console.log(`Input exams:    ${records.examRecords.length} (${uniqueExamIds.size} unique IDs)`);
  console.log(`Input images:   ${records.imageRecords.length} (${uniqueImageIds.size} unique IDs)`);
  console.log(`Missing image URLs: ${records.missingUrls.length}`);
  console.log(`Existing exact patients: ${info.existingPatients.length}`);
  console.log(`Existing exact exams/id/ecloud: ${info.existingExams.length}`);
  console.log(`Existing exact images: ${info.existingImages.length}`);
  console.log(`Same-name different-ID warnings: ${info.sameNameWarnings.length}`);
  console.log(`Current DB counts: ${JSON.stringify(info.dbCounts)}`);

  if (records.missingUrls.length > 0) {
    console.log('\nFirst missing URLs:');
    console.log(records.missingUrls.slice(0, 10));
  }

  if (info.sameNameWarnings.length > 0) {
    console.log('\nSame-name/different-ID records found. They will NOT be merged by this script.');
    console.log(info.sameNameWarnings.slice(0, 20));
  }

  if (!execute) {
    console.log('\nPreview only. Re-run with --execute to write.');
    return;
  }

  if (records.missingUrls.length > 0) {
    throw new Error('Refusing to execute with missing Bytescale URLs.');
  }

  const result = await executeImport(records, info);
  console.log('\nImport complete:');
  console.log(result);
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
