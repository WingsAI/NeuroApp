/**
 * delete_elivan_duplicate.js - Delete Francisco Elivan's duplicate exam
 *
 * Delete exam 697001c626260539c16a9608 (1 image, broken selectedImages)
 * Keep exam 697001c64e429636ed944c06 (6 images, good report)
 *
 * Usage:
 *   node scripts/delete_elivan_duplicate.js              # Preview
 *   node scripts/delete_elivan_duplicate.js --execute     # Apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const deleteExamId = '697001c626260539c16a9608';
  const keepExamId = '697001c64e429636ed944c06';

  const deleteExam = await prisma.exam.findUnique({
    where: { id: deleteExamId },
    include: { images: true, report: true, referral: true, patient: { select: { name: true, id: true } } }
  });

  const keepExam = await prisma.exam.findUnique({
    where: { id: keepExamId },
    include: { images: true, report: true, patient: { select: { name: true, id: true } } }
  });

  console.log('DELETE:', deleteExamId);
  console.log('  Patient:', deleteExam.patient.name);
  console.log('  Images:', deleteExam.images.length);
  console.log('  Report:', deleteExam.report ? 'YES' : 'NO');
  console.log('  Referral:', deleteExam.referral ? 'YES' : 'NO');

  console.log('\nKEEP:', keepExamId);
  console.log('  Patient:', keepExam.patient.name);
  console.log('  Images:', keepExam.images.length);
  console.log('  Report:', keepExam.report ? 'YES' : 'NO');

  // Patient ID is same as deleteExamId — need to update patient ID
  const patientId = deleteExam.patient.id;
  console.log('\nPatient ID:', patientId);
  console.log('Patient ID === deleteExamId:', patientId === deleteExamId);

  if (EXECUTE) {
    // Delete history entries for the report being deleted
    if (deleteExam.report) {
      await prisma.selectedImagesHistory.deleteMany({
        where: { reportId: deleteExam.report.id }
      });
      console.log('\n✓ Deleted history entries for report');
    }

    // Cascade delete handles images, report, referral
    await prisma.exam.delete({ where: { id: deleteExamId } });
    console.log('✓ Exam deleted (cascade: images, report, referral)');

    // Verify
    const remaining = await prisma.exam.findMany({
      where: { patientId: patientId },
      include: { images: true, report: true }
    });
    console.log(`\nRemaining exams for patient: ${remaining.length}`);
    for (const e of remaining) {
      console.log(`  ${e.id}: ${e.images.length} images, report: ${e.report ? 'YES' : 'NO'}`);
    }
  } else {
    console.log('\nRun with --execute to apply.');
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
