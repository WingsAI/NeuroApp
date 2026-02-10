const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Francisco Elivan de Sousa has 2 exams on the same day
// Exam 1 (697001c64e429636ed944c06): 11 images, 4 are REDFREE + 1 is cross-exam duplicate
// Exam 2 (697001c626260539c16a9608): 3 images, 2 are REDFREE

// REDFREE UUIDs (from bytescale_mapping_v2.json image types):
// Exam 1 REDFREE:
//   482ad370-98d7-42a4-9187-f17c76c25bd5 -> img-3907caeb-1fd2-4366-9ed1-c4a956930e7e.jpg
//   536d9de7-e73b-49b4-b22b-4ab80ab65de6 -> img-14ece667-b7c7-4072-90a5-56ec73167de7.jpg
//   7f8f87b0-5c8c-46c3-abda-97a53ec8b3bd -> img-a1dca00a-362a-44f8-9735-cb0a3c7efdb1.jpg
//   bcfab274-a9fb-4186-b19f-f8706d3d1578 -> img-9a181d83-10fd-4da3-abbd-f8c001022f1f.jpg
// Exam 1 cross-exam duplicate (URL belongs to exam 2 folder):
//   cmkv7cfej002xvck0t0kw3ay6 -> points to exam 2's 699fbe5e image
//
// Exam 2 REDFREE:
//   069a2b11-b072-4d4f-9042-2745da64d5a0 -> img-945943ec-22b6-4a80-8ef1-da76c8fb5af8.jpg
//   474c8335-a2b1-4ce0-8e61-cf586e2f6380 -> img-5ff70b4b-3663-4332-96b1-ecb0158b8c08.jpg

const EXECUTE = process.argv.includes('--execute');

const IMAGES_TO_DELETE = [
  // Exam 1 REDFREE
  'img-3907caeb-1fd2-4366-9ed1-c4a956930e7e.jpg',
  'img-14ece667-b7c7-4072-90a5-56ec73167de7.jpg',
  'img-a1dca00a-362a-44f8-9735-cb0a3c7efdb1.jpg',
  'img-9a181d83-10fd-4da3-abbd-f8c001022f1f.jpg',
  // Exam 1 cross-exam duplicate
  'cmkv7cfej002xvck0t0kw3ay6',
  // Exam 2 REDFREE
  'img-945943ec-22b6-4a80-8ef1-da76c8fb5af8.jpg',
  'img-5ff70b4b-3663-4332-96b1-ecb0158b8c08.jpg',
];

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}`);
  console.log('');

  // Verify images exist
  const images = await prisma.examImage.findMany({
    where: { id: { in: IMAGES_TO_DELETE } },
    include: { Exam: { select: { eyerCloudId: true } } }
  });

  console.log(`Found ${images.length} of ${IMAGES_TO_DELETE.length} images to delete:`);
  for (const img of images) {
    console.log(`  ${img.id} | exam: ${img.Exam.eyerCloudId} | type: ${img.type} | url: ${img.url}`);
  }

  const missing = IMAGES_TO_DELETE.filter(id => !images.find(i => i.id === id));
  if (missing.length > 0) {
    console.log(`\nWARNING: ${missing.length} images not found: ${missing.join(', ')}`);
  }

  if (EXECUTE && images.length > 0) {
    const result = await prisma.examImage.deleteMany({
      where: { id: { in: IMAGES_TO_DELETE } }
    });
    console.log(`\nDeleted ${result.count} images.`);
  }

  // Show final state
  console.log('\n=== Final state ===');
  const exams = await prisma.exam.findMany({
    where: { patientId: '697001c626260539c16a9608' },
    include: { images: true }
  });
  for (const exam of exams) {
    console.log(`\nExam ${exam.eyerCloudId} (${exam.examDate?.toISOString()}):`);
    console.log(`  Images: ${exam.images.length}`);
    for (const img of exam.images) {
      const willDelete = IMAGES_TO_DELETE.includes(img.id);
      console.log(`  ${willDelete ? '[DELETE] ' : '  '}${img.id} | ${img.type} | ${img.url}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
