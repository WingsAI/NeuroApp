const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check image types in DB
  const typeStats = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count FROM "ExamImage" GROUP BY type ORDER BY count DESC
  `;
  console.log('=== IMAGE TYPES IN DB ===');
  typeStats.forEach(r => console.log(`  ${r.type || 'NULL'}: ${r.count}`));

  // Check a sample of images to understand the pattern
  const sampleColor = await prisma.examImage.findMany({ where: { type: 'COLOR' }, take: 5 });
  const sampleAnterior = await prisma.examImage.findMany({ where: { type: 'ANTERIOR' }, take: 5 });
  const sampleUnknown = await prisma.examImage.findMany({ where: { type: 'UNKNOWN' }, take: 5 });

  console.log('\n=== SAMPLE COLOR IMAGES ===');
  sampleColor.forEach(img => console.log(`  ${img.fileName} | ${img.url?.substring(0, 80)}`));

  console.log('\n=== SAMPLE ANTERIOR IMAGES ===');
  sampleAnterior.forEach(img => console.log(`  ${img.fileName} | ${img.url?.substring(0, 80)}`));

  console.log('\n=== SAMPLE UNKNOWN IMAGES ===');
  sampleUnknown.forEach(img => console.log(`  ${img.fileName} | ${img.url?.substring(0, 80)}`));

  // Check state file for image type info
  const state = require('./eyercloud_downloader/download_state.json');
  const firstExam = Object.entries(state.exam_details)[0];
  console.log('\n=== STATE EXAM DETAILS FIELDS ===');
  console.log(JSON.stringify(firstExam[1], null, 2));

  // Check mapping for image type info
  const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');
  const firstMapping = Object.values(mapping)[0];
  console.log('\n=== MAPPING ENTRY IMAGE FIELDS ===');
  if (firstMapping.images && firstMapping.images[0]) {
    console.log(JSON.stringify(firstMapping.images[0], null, 2));
    console.log('Image fields:', Object.keys(firstMapping.images[0]));
  }

  // Check if any mapping entries have type info in images
  let withType = 0, withoutType = 0;
  for (const entry of Object.values(mapping)) {
    for (const img of (entry.images || [])) {
      if (img.type) withType++;
      else withoutType++;
    }
  }
  console.log(`\nMapping images with type: ${withType}`);
  console.log(`Mapping images without type: ${withoutType}`);

  // Check expected_images in state
  let totalExpected = 0;
  for (const d of Object.values(state.exam_details)) {
    totalExpected += d.expected_images || 0;
  }
  console.log(`\nTotal expected images in state: ${totalExpected}`);

  await prisma.$disconnect();
}

main().catch(console.error);
