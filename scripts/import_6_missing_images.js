/**
 * import_6_missing_images.js - Import 6 missing images into DB for 3 patients
 *
 * Reads upload_6_results.json (Bytescale URLs) and creates ExamImage records.
 * Uses img-{UUID}.jpg format for image IDs.
 *
 * Usage:
 *   node scripts/import_6_missing_images.js              # Preview
 *   node scripts/import_6_missing_images.js --execute     # Apply
 */

const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log('=== Import 6 Missing Images ===');
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  // Load upload results
  const results = JSON.parse(
    fs.readFileSync('scripts/eyercloud_downloader/upload_6_results.json', 'utf8')
  );

  console.log(`Found ${results.length} images to import\n`);

  let created = 0;
  let skipped = 0;

  for (const img of results) {
    const imageId = `img-${img.uuid}.jpg`;
    const examId = img.exam_id;

    // Check if exam exists
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      console.log(`  EXAM NOT FOUND: ${examId} — skipping ${img.uuid}`);
      skipped++;
      continue;
    }

    // Check if image already exists
    const existing = await prisma.examImage.findUnique({ where: { id: imageId } });
    if (existing) {
      console.log(`  ALREADY EXISTS: ${imageId} — skipping`);
      skipped++;
      continue;
    }

    // Also check by URL to avoid duplicates
    const byUrl = await prisma.examImage.findFirst({
      where: { examId, url: img.bytescale_url }
    });
    if (byUrl) {
      console.log(`  URL ALREADY IN DB: ${byUrl.id} — skipping ${img.uuid}`);
      skipped++;
      continue;
    }

    console.log(`  CREATE: ${imageId}`);
    console.log(`    Exam: ${examId} (${img.patient})`);
    console.log(`    Type: ${img.type} Lat: ${img.lat}`);
    console.log(`    URL: ${img.bytescale_url}`);

    if (EXECUTE) {
      await prisma.examImage.create({
        data: {
          id: imageId,
          examId: examId,
          url: img.bytescale_url,
          fileName: `${img.uuid}.jpg`,
          type: img.type, // COLOR or ANTERIOR
        }
      });
      console.log(`    ✓ Created`);
    }
    created++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);

  if (!EXECUTE && created > 0) {
    console.log(`\nRun with --execute to apply changes.`);
  }

  // Show final state of the 3 exams
  console.log('\n=== EXAM IMAGE COUNTS ===');
  const examIds = ['697d03dd565494aed21c07c4', '697d03df7927d48de9d88c52', '697d03e48bc8fc9984f742b0'];
  for (const eid of examIds) {
    const images = await prisma.examImage.findMany({ where: { examId: eid } });
    const exam = await prisma.exam.findUnique({
      where: { id: eid },
      include: { patient: { select: { name: true } } }
    });
    const colorCount = images.filter(i => i.type === 'COLOR').length;
    const anteriorCount = images.filter(i => i.type === 'ANTERIOR').length;
    console.log(`  ${exam?.patient.name || 'Unknown'} (${eid}): ${images.length} images (${colorCount} COLOR, ${anteriorCount} ANTERIOR)`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
