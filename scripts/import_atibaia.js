#!/usr/bin/env node
/**
 * Import Atibaia EyerCloud data into the MAIN database.
 *
 * Reads:
 *   scripts/eyercloud_downloader/staging_state_prevavcatibaia.json  (patients/exams/images metadata)
 *   scripts/eyercloud_downloader/atibaia_bytescale_mapping.json     (exam_id -> [{uuid, type, url}])
 *
 * Writes to main DB:
 *   - HealthUnit "Atibaia-SP"            (idempotent)
 *   - Patient   (dedup by normalized name against existing main DB)
 *   - Exam      (status='pending', location='Atibaia-SP')
 *   - ExamImage (id format: img-{UUID}.jpg, with Bytescale URL)
 *
 * Locked patients (alphabetically before JOAQUIM FERNANDES) are not modified
 * — we never overwrite them. New patients added by this script are unrelated.
 *
 * Usage:
 *   node scripts/import_atibaia.js              # preview
 *   node scripts/import_atibaia.js --execute    # apply
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

const UNIT_NAME = 'Atibaia-SP';
const STAGING_FILE = path.join(__dirname, 'eyercloud_downloader/staging_state_prevavcatibaia.json');
const MAPPING_FILE = path.join(__dirname, 'eyercloud_downloader/atibaia_bytescale_mapping.json');

function normalizeName(name) {
  if (!name) return '';
  return name.toUpperCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function parseDate(s) {
  if (!s) return null;
  // ISO format from EyerCloud (e.g. "2026-04-27T13:26:09+00:00")
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // DD/MM/YYYY fallback
  const parts = s.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    d = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function normalizeGender(g) {
  if (!g) return null;
  const s = String(g).trim().toLowerCase();
  if (['male', 'masculino', 'm'].includes(s)) return 'Masculino';
  if (['female', 'feminino', 'f'].includes(s)) return 'Feminino';
  return g;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Import Atibaia → MAIN DB  [${EXECUTE ? '🔴 EXECUTE' : '🟢 PREVIEW'}]`);
  console.log(`${'='.repeat(60)}\n`);

  if (!fs.existsSync(STAGING_FILE)) { console.error(`Missing ${STAGING_FILE}`); process.exit(1); }
  if (!fs.existsSync(MAPPING_FILE)) {
    console.warn(`⚠️  Missing ${MAPPING_FILE} — images will be skipped`);
  }
  const staging = JSON.parse(fs.readFileSync(STAGING_FILE, 'utf-8'));
  const mapping = fs.existsSync(MAPPING_FILE)
    ? JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'))
    : {};

  // === Phase 0: HealthUnit ===
  let unit = await prisma.healthUnit.findUnique({ where: { name: UNIT_NAME } });
  if (!unit) {
    console.log(`HealthUnit "${UNIT_NAME}": NOT FOUND — will create`);
    if (EXECUTE) {
      unit = await prisma.healthUnit.create({
        data: {
          id: crypto.randomUUID(),
          name: UNIT_NAME,
          address: 'Atibaia, SP',
          email: 'prevavcatibaia@gmail.com',
          phone: '',
          responsible: 'PREVAV Atibaia',
          updatedAt: new Date(),
        },
      });
      console.log(`  ✅ Created: ${unit.id}`);
    }
  } else {
    console.log(`HealthUnit "${UNIT_NAME}": EXISTS (${unit.id})`);
  }

  // === Phase 1: Patients (dedup by normalized name vs main DB) ===
  const stagingPatients = Object.values(staging.patients || {});
  console.log(`\nStaging patients: ${stagingPatients.length}`);

  const existingPatients = await prisma.patient.findMany({
    select: { id: true, name: true },
  });
  const existingByName = new Map();
  for (const p of existingPatients) {
    existingByName.set(normalizeName(p.name), p.id);
  }
  console.log(`Existing main DB patients: ${existingPatients.length}`);

  // patientId mapping (staging.id -> main DB patient.id)
  const patientIdMap = {};
  const newPatients = [];
  let dedupedCount = 0;

  for (const p of stagingPatients) {
    const norm = normalizeName(p.rawName);
    if (!norm) continue;
    if (existingByName.has(norm)) {
      patientIdMap[p.id] = existingByName.get(norm);
      dedupedCount++;
      continue;
    }
    // New patient — use staging EyerCloud id as main DB id
    patientIdMap[p.id] = p.id;
    newPatients.push({
      id: p.id,
      name: p.rawName.trim(),
      cpf: p.cpf || null,
      birthDate: parseDate(p.birthday),
      gender: normalizeGender(p.gender),
      phone: p.phone || null,
      ophthalmicDiseases: p.ophthalmicDiseases || null,
      underlyingDiseases: p.underlyingDiseases || null,
      updatedAt: new Date(),
    });
  }
  console.log(`  Already in main DB (deduped by name): ${dedupedCount}`);
  console.log(`  New patients to create:                 ${newPatients.length}`);

  // === Phase 2: Exams ===
  const stagingExams = Object.values(staging.exams || {});
  const examImages = staging.exam_images || {};

  const existingExamIds = new Set(
    (await prisma.exam.findMany({ select: { id: true } })).map(e => e.id)
  );
  const existingByEyerId = new Set(
    (await prisma.exam.findMany({ where: { eyerCloudId: { not: null } }, select: { eyerCloudId: true } }))
      .map(e => e.eyerCloudId)
  );

  const newExams = [];
  let examsSkipped = 0;
  for (const e of stagingExams) {
    if (existingExamIds.has(e.id) || existingByEyerId.has(e.id)) {
      examsSkipped++;
      continue;
    }
    const patientId = patientIdMap[e.patientId];
    if (!patientId) { examsSkipped++; continue; }
    newExams.push({
      id: e.id,
      eyerCloudId: e.id,
      examDate: parseDate(e.examDate) || new Date(),
      location: UNIT_NAME,
      technicianName: e.technicianName || '',
      status: 'pending',
      patientId,
      updatedAt: new Date(),
    });
  }
  console.log(`\nStaging exams: ${stagingExams.length}`);
  console.log(`  Already exist:  ${examsSkipped}`);
  console.log(`  New exams:      ${newExams.length}`);

  // === Phase 3: Images ===
  const newExamIds = new Set(newExams.map(e => e.id));
  const newImages = [];
  let imagesNoUrl = 0;
  let imagesFiltered = 0;
  const typeCounts = { COLOR: 0, ANTERIOR: 0, OTHER: 0 };

  for (const [examId, imgs] of Object.entries(examImages)) {
    if (!newExamIds.has(examId)) continue;
    const mapped = mapping[examId] || [];
    const urlByUuid = new Map(mapped.map(m => [m.uuid, m.url]));

    for (const img of imgs) {
      const t = (img.type || '').toUpperCase();
      if (t !== 'COLOR' && t !== 'ANTERIOR') {
        imagesFiltered++;
        continue;
      }
      const url = urlByUuid.get(img.uuid);
      if (!url) {
        imagesNoUrl++;
        continue;
      }
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      newImages.push({
        id: `img-${img.uuid}.jpg`,
        url,
        fileName: `${img.uuid}.jpg`,
        type: t,
        examId,
      });
    }
  }
  console.log(`\nImages:`);
  console.log(`  To insert:        ${newImages.length}  ${JSON.stringify(typeCounts)}`);
  console.log(`  Filtered (type):  ${imagesFiltered}`);
  console.log(`  Skipped (no URL): ${imagesNoUrl}`);

  // === Execute or summarize ===
  if (!EXECUTE) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  PREVIEW — no changes written. Re-run with --execute.`);
    console.log(`${'='.repeat(60)}\n`);
    return;
  }

  console.log(`\n--- Writing to main DB ---`);
  if (newPatients.length) {
    const r = await prisma.patient.createMany({ data: newPatients, skipDuplicates: true });
    console.log(`  Patients inserted: ${r.count}`);
  }
  if (newExams.length) {
    const r = await prisma.exam.createMany({ data: newExams, skipDuplicates: true });
    console.log(`  Exams inserted:    ${r.count}`);
  }
  if (newImages.length) {
    // chunked insert to be safe
    let inserted = 0;
    for (let i = 0; i < newImages.length; i += 500) {
      const r = await prisma.examImage.createMany({
        data: newImages.slice(i, i + 500),
        skipDuplicates: true,
      });
      inserted += r.count;
    }
    console.log(`  Images inserted:   ${inserted}`);
  }
  console.log(`\n✅ DONE`);
}

main()
  .catch(e => { console.error('FATAL:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
