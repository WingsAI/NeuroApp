/**
 * restore_ivna_selected.js - Restore Ivna's selectedImages
 *
 * The doctor selected images on 13/02/2026 but fix_cml_selected_images.js
 * nullified them on 14/02. Restoring based on visual comparison with the
 * doctor's PDF screenshot.
 *
 * OD = img-3a5f78df-b772-4d38-a2e9-cb8390d3309e.jpg (COLOR R)
 * OE = img-4380201e-f139-4e60-a53d-a58bc2f063bb.jpg (COLOR L)
 *
 * Usage:
 *   node scripts/restore_ivna_selected.js              # Preview
 *   node scripts/restore_ivna_selected.js --execute     # Apply
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const examId = '697001c9029f1e6981546a85';
  const newOd = 'img-3a5f78df-b772-4d38-a2e9-cb8390d3309e.jpg';
  const newOe = 'img-4380201e-f139-4e60-a53d-a58bc2f063bb.jpg';

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      images: true,
      report: true,
      patient: { select: { name: true } }
    }
  });

  console.log('Patient:', exam.patient.name);
  console.log('Current selectedImages:', JSON.stringify(exam.report.selectedImages));
  console.log('New selectedImages:', JSON.stringify({ od: newOd, oe: newOe }));

  // Verify both images exist in this exam
  const odExists = exam.images.some(i => i.id === newOd);
  const oeExists = exam.images.some(i => i.id === newOe);
  console.log(`\nOD image exists: ${odExists}`);
  console.log(`OE image exists: ${oeExists}`);

  if (!odExists || !oeExists) {
    console.log('\nERROR: One or both images not found in exam. Aborting.');
    await prisma.$disconnect();
    return;
  }

  if (EXECUTE) {
    // Update selectedImages
    await prisma.medicalReport.update({
      where: { id: exam.report.id },
      data: { selectedImages: { od: newOd, oe: newOe } }
    });

    // Log history
    await prisma.selectedImagesHistory.create({
      data: {
        reportId: exam.report.id,
        previousImages: exam.report.selectedImages || Prisma.DbNull,
        newImages: { od: newOd, oe: newOe },
        changedBy: 'script:restore_ivna_selected.js',
        reason: 'Restore selection lost by fix_cml_selected_images.js on 14/02/2026'
      }
    });

    console.log('\n✓ selectedImages restored');
    console.log('✓ History entry created');
  } else {
    console.log('\nRun with --execute to apply.');
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
