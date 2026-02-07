/**
 * fix_image_types.js - Remove REDFREE images and fix ANTERIOR labels
 * ===================================================================
 *
 * Uses image_types.json (from fetch_image_types.py) to:
 * 1. Match DB images to EyerCloud UUIDs by filename in URL
 * 2. Delete images that are REDFREE (derived duplicates)
 * 3. Update images that are ANTERIOR (fix type label)
 * 4. Keep COLOR images as-is
 *
 * Uso:
 *   node scripts/fix_image_types.js              # Preview
 *   node scripts/fix_image_types.js --execute     # Aplicar
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(execute ? 'MODO EXECUCAO' : 'MODO PREVIEW');

  // Load image types from EyerCloud API
  const imageTypes = require('./eyercloud_downloader/image_types.json');

  // Build a map: uuid -> type (across all exams)
  const uuidToType = {};
  let totalMapped = 0;
  for (const [examId, types] of Object.entries(imageTypes)) {
    for (const [uuid, type] of Object.entries(types)) {
      uuidToType[uuid] = type;
      totalMapped++;
    }
  }
  console.log(`Image types loaded: ${totalMapped} UUIDs across ${Object.keys(imageTypes).length} exams`);

  // Get all DB images
  const allImages = await prisma.examImage.findMany({
    select: { id: true, url: true, type: true, examId: true }
  });
  console.log(`DB images: ${allImages.length}`);

  // Match DB images to UUIDs
  // URLs look like: https://upcdn.io/.../PATIENT_NAME_EXAMID/UUID.jpg
  // or similar patterns with the UUID as the filename
  let matched = 0;
  let unmatched = 0;
  let toDelete = [];
  let toFixAnterior = [];
  let alreadyCorrect = 0;

  for (const img of allImages) {
    // Extract UUID from URL filename
    const urlParts = img.url.split('/');
    const filename = urlParts[urlParts.length - 1]; // e.g., "uuid.jpg"
    const uuid = filename.replace(/\.(jpg|jpeg|png)$/i, '');

    const realType = uuidToType[uuid];

    if (!realType) {
      unmatched++;
      continue;
    }

    matched++;

    if (realType === 'REDFREE') {
      toDelete.push(img);
    } else if (realType === 'ANTERIOR' && img.type !== 'ANTERIOR') {
      toFixAnterior.push(img);
    } else {
      alreadyCorrect++;
    }
  }

  console.log(`\nMatched: ${matched} / ${allImages.length}`);
  console.log(`Unmatched (no UUID in image_types): ${unmatched}`);
  console.log(`\nActions:`);
  console.log(`  DELETE (REDFREE): ${toDelete.length}`);
  console.log(`  FIX TYPE -> ANTERIOR: ${toFixAnterior.length}`);
  console.log(`  Already correct: ${alreadyCorrect}`);

  // Show some examples
  if (toDelete.length > 0) {
    console.log(`\nSample REDFREE to delete:`);
    for (const img of toDelete.slice(0, 3)) {
      console.log(`  exam ${img.examId.substring(0, 16)}... | ${img.url.split('/').pop()}`);
    }
  }
  if (toFixAnterior.length > 0) {
    console.log(`\nSample ANTERIOR to fix:`);
    for (const img of toFixAnterior.slice(0, 3)) {
      console.log(`  exam ${img.examId.substring(0, 16)}... | ${img.url.split('/').pop()} | was: ${img.type}`);
    }
  }

  // Check unmatched images - are they from cml* exams?
  if (unmatched > 0) {
    const unmatchedImages = allImages.filter(img => {
      const uuid = img.url.split('/').pop().replace(/\.(jpg|jpeg|png)$/i, '');
      return !uuidToType[uuid];
    });
    const cmlImages = unmatchedImages.filter(i => i.examId.startsWith('cml'));
    const otherUnmatched = unmatchedImages.filter(i => !i.examId.startsWith('cml'));
    console.log(`\nUnmatched breakdown:`);
    console.log(`  cml* exams (manual/UI): ${cmlImages.length}`);
    console.log(`  Other unmatched: ${otherUnmatched.length}`);

    if (otherUnmatched.length > 0 && otherUnmatched.length <= 10) {
      console.log(`  Other unmatched details:`);
      for (const img of otherUnmatched) {
        console.log(`    exam ${img.examId} | ${img.url.split('/').pop()}`);
      }
    }
  }

  if (!execute) {
    console.log(`\nUse --execute to apply changes`);
  } else {
    // Delete REDFREE images in batches
    console.log(`\nDeleting ${toDelete.length} REDFREE images...`);
    let deleted = 0;
    for (let i = 0; i < toDelete.length; i += 100) {
      const batch = toDelete.slice(i, i + 100);
      const ids = batch.map(img => img.id);
      await prisma.examImage.deleteMany({
        where: { id: { in: ids } }
      });
      deleted += batch.length;
      if ((i + 100) % 500 === 0 || i + 100 >= toDelete.length) {
        console.log(`  Deleted ${deleted} / ${toDelete.length}`);
      }
    }

    // Fix ANTERIOR labels
    console.log(`\nFixing ${toFixAnterior.length} ANTERIOR labels...`);
    let fixed = 0;
    for (let i = 0; i < toFixAnterior.length; i += 100) {
      const batch = toFixAnterior.slice(i, i + 100);
      const ids = batch.map(img => img.id);
      await prisma.examImage.updateMany({
        where: { id: { in: ids } },
        data: { type: 'ANTERIOR' }
      });
      fixed += batch.length;
    }
    console.log(`  Fixed ${fixed} images`);
  }

  // Final counts
  const finalImages = await prisma.examImage.count();
  const finalByType = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count FROM "ExamImage" GROUP BY type ORDER BY count DESC
  `;
  const finalExams = await prisma.exam.count();
  const finalPatients = await prisma.patient.count();
  const finalReports = await prisma.medicalReport.count();

  console.log(`\nDB final: ${finalPatients} patients, ${finalExams} exams, ${finalImages} images, ${finalReports} reports`);
  console.log(`Image types in DB:`);
  for (const row of finalByType) {
    console.log(`  ${row.type || 'NULL'}: ${row.count}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
