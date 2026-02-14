/**
 * Delete Antonia Paula's duplicate exam (697001c1029f1e6981546a7d - 2 images)
 * Keep exam 697001c126260539c16a9603 (10 images, correct)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const deleteId = '697001c1029f1e6981546a7d';
  const keepId = '697001c126260539c16a9603';

  const del = await prisma.exam.findUnique({
    where: { id: deleteId },
    include: { images: true, report: true, referral: true, patient: { select: { name: true, id: true } } }
  });
  const keep = await prisma.exam.findUnique({
    where: { id: keepId },
    include: { images: true, report: true }
  });

  console.log('DELETE:', deleteId, `(${del.images.length} images, report: ${del.report ? 'YES' : 'NO'})`);
  console.log('KEEP:', keepId, `(${keep.images.length} images, report: ${keep.report ? 'YES' : 'NO'})`);
  console.log('Patient ID:', del.patient.id, '=== deleteId:', del.patient.id === deleteId);

  if (EXECUTE) {
    if (del.report) {
      await prisma.selectedImagesHistory.deleteMany({ where: { reportId: del.report.id } });
      console.log('✓ Deleted history entries');
    }
    await prisma.exam.delete({ where: { id: deleteId } });
    console.log('✓ Exam deleted');

    const remaining = await prisma.exam.findMany({
      where: { patientId: del.patient.id },
      include: { images: true, report: true }
    });
    console.log(`\nRemaining exams: ${remaining.length}`);
    for (const e of remaining) {
      console.log(`  ${e.id}: ${e.images.length} images, report: ${e.report ? 'YES' : 'NO'}`);
    }
  } else {
    console.log('\nRun with --execute to apply.');
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
