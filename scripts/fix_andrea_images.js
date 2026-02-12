const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 9 images that belong to ANTÔNIO BENEDITO SANTOS but were wrongly assigned to ANDRÉA's exam
const wrongImageIds = [
  'img-25ed2256-4aa4-4534-af8e-d62d370c7f54.jpg',
  'img-52645626-f840-4f29-9b92-6d5d3b2456b9.jpg',
  'img-7996c609-4c52-450a-86cc-57d60a3abf40.jpg',
  'img-a58a40b2-fdff-434d-b9d6-190d19fa9d55.jpg',
  'img-a7204b75-1d86-4b5f-8130-390a04dfd026.jpg',
  'img-b5f0e44a-6d40-4e65-a0b9-f9eef2c0a6d3.jpg',
  'img-c33d3062-9043-4791-a261-6e9b87abbfc4.jpg',
  'img-d41ddf07-b878-437e-980e-21d524baa10e.jpg',
  'img-d97fc265-4e88-4ddb-b3f3-9e3c7b6a23d9.jpg',
];

async function main() {
  // Verify before deleting
  const images = await prisma.examImage.findMany({
    where: { id: { in: wrongImageIds } },
    include: { Exam: { include: { patient: true } } }
  });

  console.log(`Found ${images.length} of ${wrongImageIds.length} images to delete:`);
  for (const img of images) {
    console.log(`  ${img.id} | exam=${img.examId} | patient=${img.Exam.patient.name} | url contains ANTONIO: ${img.url.includes('ANTONIO')}`);
  }

  // Safety check: all should be on Andrea's exam and have Antonio's URL
  const allCorrect = images.every(img =>
    img.examId === '69838264a0e9c8adf6826e58' &&
    img.url.includes('ANT%C3%94NIO_BENEDITO_SANTOS')
  );

  if (!allCorrect) {
    console.error('SAFETY CHECK FAILED - some images do not match expected criteria. Aborting.');
    process.exit(1);
  }

  console.log('\nSafety check passed. Deleting...');

  const result = await prisma.examImage.deleteMany({
    where: { id: { in: wrongImageIds } }
  });

  console.log(`Deleted ${result.count} images.`);

  // Verify final state
  const exam = await prisma.exam.findUnique({
    where: { id: '69838264a0e9c8adf6826e58' },
    include: { images: { orderBy: { id: 'asc' } }, patient: true }
  });

  console.log(`\nAndréa now has ${exam.images.length} images:`);
  exam.images.forEach((img, i) => {
    console.log(`  ${i + 1}. ${img.id} | ${img.type} | ${img.url.substring(0, 100)}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
