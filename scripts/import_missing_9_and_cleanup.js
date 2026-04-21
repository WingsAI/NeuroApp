/**
 * One-shot fix script for 2026-04-21:
 *
 * 1. Insert ExamImage rows for 9 Campos do Jordão exams from 06/02/2026 that were
 *    registered without photos (IDs listed in missing_9/upload_result.json).
 * 2. Correct their Exam.examDate (26/02 → 06/02/2026) and Exam.location
 *    ("Jaci-SP" → "Campos do Jordão-SP").
 * 3. Delete 2 empty duplicate exams left as orphans:
 *      - cml684a864dedfb89c70fa3  (EMILIO MUNHOZ FILHO – dup of 69809d9151ffa0242a2cddc4)
 *      - 69b004179265e211bdd1bf6b (JOSE RUBENS FERNANDES AMADO – dup of 69b00419577d4864ace4dfac)
 *
 * Usage:
 *   node scripts/import_missing_9_and_cleanup.js          # preview
 *   node scripts/import_missing_9_and_cleanup.js --execute
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

const UPLOAD_RESULT = path.join(
  __dirname,
  'eyercloud_downloader',
  'missing_9',
  'upload_result.json'
);

const EXAM_DATE_CORRECT = new Date('2026-02-06T12:00:00Z');
const LOCATION_CORRECT = 'Campos do Jordão-SP';

const DUPLICATES_TO_DELETE = [
  { examId: 'cml684a864dedfb89c70fa3', patient: 'EMILIO MUNHOZ FILHO' },
  { examId: '69b004179265e211bdd1bf6b', patient: 'JOSE RUBENS FERNANDES AMADO' },
];

async function main() {
  const data = JSON.parse(fs.readFileSync(UPLOAD_RESULT, 'utf-8'));
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}`);
  console.log(`Input: ${data.length} exams, ${data.reduce((n, e) => n + e.images.length, 0)} images\n`);

  let imagesAdded = 0;
  let examsUpdated = 0;
  let examsDeleted = 0;

  for (const ex of data) {
    const exam = await prisma.exam.findUnique({
      where: { id: ex.eyerCloudId },
      include: { images: true, patient: true },
    });
    if (!exam) {
      console.log(`  SKIP: exam ${ex.eyerCloudId} not found`);
      continue;
    }
    if (exam.patient.name !== ex.dbName) {
      console.log(`  WARN: name mismatch for ${ex.eyerCloudId}: DB="${exam.patient.name}" meta="${ex.dbName}"`);
    }
    console.log(`>> ${exam.patient.name} (${exam.id}) — current images=${exam.images.length}, location=${exam.location}, examDate=${exam.examDate.toISOString().slice(0,10)}`);

    const existingIds = new Set(exam.images.map(i => i.id));
    const toInsert = ex.images
      .map(img => ({
        id: `img-${img.uuid}.jpg`,
        url: img.url,
        fileName: `${img.uuid}.jpg`,
        type: img.type,
        examId: exam.id,
      }))
      .filter(row => !existingIds.has(row.id));
    console.log(`   would insert ${toInsert.length} ExamImage rows`);

    const needDateFix = exam.examDate.toISOString().slice(0, 10) !== '2026-02-06';
    const needLocFix = exam.location !== LOCATION_CORRECT;
    console.log(`   update examDate? ${needDateFix}  |  update location? ${needLocFix}`);

    if (EXECUTE) {
      if (toInsert.length > 0) {
        await prisma.examImage.createMany({ data: toInsert, skipDuplicates: true });
        imagesAdded += toInsert.length;
      }
      if (needDateFix || needLocFix) {
        await prisma.exam.update({
          where: { id: exam.id },
          data: {
            ...(needDateFix ? { examDate: EXAM_DATE_CORRECT } : {}),
            ...(needLocFix ? { location: LOCATION_CORRECT } : {}),
          },
        });
        examsUpdated++;
      }
    }
  }

  console.log('\n--- Duplicate cleanup ---');
  for (const d of DUPLICATES_TO_DELETE) {
    const ex = await prisma.exam.findUnique({
      where: { id: d.examId },
      include: { images: true, report: true, referral: true, patient: true },
    });
    if (!ex) {
      console.log(`  SKIP: ${d.examId} not found`);
      continue;
    }
    const imgs = ex.images.length;
    const hasReport = !!ex.report;
    const hasReferral = !!ex.referral;
    console.log(`  ${d.patient} | ${d.examId} | images=${imgs} | report=${hasReport} | referral=${hasReferral}`);
    if (hasReport || imgs > 0) {
      console.log(`    REFUSE: exam has report or images — not safe to delete`);
      continue;
    }
    if (EXECUTE) {
      await prisma.exam.delete({ where: { id: d.examId } });
      examsDeleted++;
      console.log(`    DELETED`);
    }
  }

  console.log(`\n${EXECUTE ? 'Executed' : 'Preview'}: images+=${imagesAdded}, exams updated=${examsUpdated}, exams deleted=${examsDeleted}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
