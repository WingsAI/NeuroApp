const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const exam = await p.exam.findUnique({
    where: { id: '697001c9029f1e6981546a85' },
    include: {
      report: true,
      images: true,
      patient: { select: { name: true } }
    }
  });
  console.log('Patient:', exam.patient.name);
  console.log('Current selectedImages:', JSON.stringify(exam.report?.selectedImages));
  console.log('Images:', exam.images.map(i => ({ id: i.id, type: i.type })));

  // Check history
  const history = await p.selectedImagesHistory.findMany({
    where: { reportId: exam.report?.id },
    orderBy: { changedAt: 'asc' }
  });
  console.log('\nHistory entries:', history.length);
  for (const h of history) {
    console.log('  ', h.changedAt.toISOString(), h.changedBy, h.reason);
    console.log('    prev:', JSON.stringify(h.previousImages));
    console.log('    new:', JSON.stringify(h.newImages));
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
