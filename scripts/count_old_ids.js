const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const old = await p.examImage.count({ where: { id: { not: { startsWith: 'img-' } } } });
  const total = await p.examImage.count();
  const newFormat = total - old;
  console.log(`Total images: ${total}`);
  console.log(`New format (img-UUID): ${newFormat}`);
  console.log(`Old format (examId-N): ${old}`);

  // Check history
  const history = await p.selectedImagesHistory.count();
  console.log(`\nHistory entries: ${history}`);

  // Show sample history
  const samples = await p.selectedImagesHistory.findMany({ take: 3 });
  for (const s of samples) {
    console.log(`  ${s.changedBy}: ${JSON.stringify(s.previousImages)} → ${JSON.stringify(s.newImages)} (${s.reason})`);
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
