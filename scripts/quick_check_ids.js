const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Check mix of ID formats
  const total = await p.examImage.count();
  const oldFormat = await p.examImage.count({ where: { id: { not: { startsWith: 'img-' } } } });
  const newFormat = await p.examImage.count({ where: { id: { startsWith: 'img-' } } });

  console.log(`Total images: ${total}`);
  console.log(`New format (img-UUID.jpg): ${newFormat}`);
  console.log(`Old format (examId-N): ${oldFormat}`);

  // Sample old format
  const samples = await p.examImage.findMany({
    where: { id: { not: { startsWith: 'img-' } } },
    take: 10,
    select: { id: true, examId: true }
  });
  console.log('\nOld format samples:');
  samples.forEach(s => console.log(`  ${s.id} (exam: ${s.examId})`));

  await p.$disconnect();
}
main();
