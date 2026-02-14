const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Old CML IDs from snapshots
  const oldOd = 'cmkv7ck61004hvck0d5pnryyw';
  const oldOe = 'cmkv7ckdi004lvck0rg0raux9';

  // Check SelectedImagesHistory for this report
  const report = await p.medicalReport.findFirst({
    where: { examId: '697001c9029f1e6981546a85' }
  });
  console.log('Report ID:', report?.id);

  const history = await p.selectedImagesHistory.findMany({
    where: { reportId: report?.id },
    orderBy: { createdAt: 'asc' }
  });
  console.log('\nHistory entries:', history.length);
  for (const h of history) {
    console.log('  ', h.createdAt.toISOString(), h.changedBy);
    console.log('    reason:', h.reason);
    console.log('    prev:', JSON.stringify(h.previousImages));
    console.log('    new:', JSON.stringify(h.newImages));
  }

  // Current images for this exam
  const images = await p.examImage.findMany({
    where: { examId: '697001c9029f1e6981546a85' }
  });
  console.log('\nCurrent images:');
  for (const img of images) {
    console.log('  ', img.id, img.type, img.url.substring(img.url.lastIndexOf('/') + 1));
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
