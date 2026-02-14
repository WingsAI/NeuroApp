/**
 * fix_ivna_selected.js - Restore Ivna's selectedImages
 *
 * The doctor selected images on 13/02 but fix_cml_selected_images.js
 * nullified them. We need to identify which images match the screenshot
 * and restore the selection.
 *
 * From the screenshot: CAPTURA 1 (left) and CAPTURA 2 (right) are both
 * retinal fundus photos (COLOR type). The optic disc is visible in both.
 *
 * Strategy: List all COLOR images with their Bytescale URLs so we can
 * visually compare, or check the old CML IDs to trace the originals.
 *
 * Usage:
 *   node scripts/fix_ivna_selected.js              # Preview
 *   node scripts/fix_ivna_selected.js --execute     # Apply
 */

const { PrismaClient, Prisma } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const exam = await prisma.exam.findUnique({
    where: { id: '697001c9029f1e6981546a85' },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: true,
      patient: { select: { name: true } }
    }
  });

  console.log('Patient:', exam.patient.name);
  console.log('Exam:', exam.id);
  console.log('Current selectedImages:', JSON.stringify(exam.report.selectedImages));

  console.log('\nAll images:');
  for (const img of exam.images) {
    console.log(`  ${img.id} | ${img.type} | ${img.url}`);
  }

  // The old CML IDs were: od=cmkv7ck61004hvck0d5pnryyw, oe=cmkv7ckdi004lvck0rg0raux9
  // These came from CML duplicate exams that were deleted.
  // We need to find which current images correspond to what the doctor selected.

  // From the EyerCloud API data for this exam (697001c9029f1e6981546a85):
  // The exam has images with laterality info. Let's check EyerCloud data.
  // Since we can't access the API now, let's use the image order.

  // From the screenshot, the doctor's report shows 2 retinal photos (COLOR).
  // CAPTURA 1 (left position = OD) shows optic disc on the RIGHT side of the image
  // CAPTURA 2 (right position = OE) shows optic disc on the LEFT side of the image
  // This matches standard ophthalmology: OD disc is nasal/right, OE disc is nasal/left

  // Let's check the EyerCloud API for laterality info
  // From previous investigation, we fetched image details for other patients.
  // For Ivna's exam, we need to check the images on EyerCloud to get laterality.

  // But we CAN check: the Bytescale URLs contain UUIDs.
  // Let's check the bytescale_mapping files for this exam.
  const fs = require('fs');

  // Check download_state for this exam
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf8'));
  const examState = state.exam_details?.['697001c9029f1e6981546a85'];
  if (examState) {
    console.log('\ndownload_state entry found:');
    console.log('  patient:', examState.patient_name);
    if (examState.image_details) {
      console.log('  image_details:');
      for (const img of examState.image_details) {
        console.log(`    ${img.uuid || img.filename} | ${img.type} | lat:${img.laterality}`);
      }
    }
  } else {
    console.log('\nNOT in download_state.json');
  }

  // Check image_types.json
  const imageTypes = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/image_types.json', 'utf8'));
  console.log('\nimage_types.json matches:');
  for (const img of exam.images) {
    const uuid = img.id.replace('img-', '').replace('.jpg', '');
    const typeInfo = imageTypes[uuid];
    if (typeInfo) {
      console.log(`  ${uuid}: type=${typeInfo.type}, lat=${typeInfo.laterality || typeInfo.imageLaterality || 'unknown'}`);
    } else {
      console.log(`  ${uuid}: NOT FOUND in image_types.json`);
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
