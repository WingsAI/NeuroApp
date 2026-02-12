const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find both exams
  const exam58 = await prisma.exam.findUnique({
    where: { id: '69838264a0e9c8adf6826e58' },
    include: { images: true, report: true, patient: true }
  });

  const exam59 = await prisma.exam.findUnique({
    where: { id: '69838264a0e9c8adf6826e59' },
    include: { images: true, report: true, patient: true }
  });

  for (const exam of [exam58, exam59]) {
    if (!exam) continue;
    console.log('\n=== EXAM', exam.id, '===');
    console.log('Patient:', exam.patient?.name, '(ID:', exam.patientId, ')');
    console.log('EyerCloud ID:', exam.eyerCloudId);
    console.log('Status:', exam.status);
    console.log('Location:', exam.location);
    console.log('Has Report:', !!exam.report);
    console.log('Images:', exam.images.length);
    exam.images.forEach((img, i) => {
      console.log(`  ${i + 1}. id=${img.id} type=${img.type}`);
      console.log(`     url=${img.url}`);
    });
  }

  // Check download_state for both
  const fs = require('fs');
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));

  for (const eid of ['69838264a0e9c8adf6826e58', '69838264a0e9c8adf6826e59']) {
    const data = state[eid];
    if (data) {
      console.log(`\n=== download_state ${eid} ===`);
      console.log('Patient:', data.patient_name);
      console.log('Folder:', data.folder_name);
      console.log('Expected images:', data.expected_images);
    } else {
      console.log(`\n${eid}: NOT in download_state`);
    }
  }

  // Search all exams whose eyerCloudId starts with 69838264
  const exams = await prisma.exam.findMany({
    where: { eyerCloudId: { startsWith: '69838264' } },
    include: { patient: true, images: true }
  });
  console.log('\n=== All exams with eyerCloudId starting with 69838264 ===');
  for (const e of exams) {
    console.log(`Exam ${e.id} | eyerCloudId=${e.eyerCloudId} | patient=${e.patient?.name} | images=${e.images.length}`);
  }

  // Check mapping for both IDs
  const v2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf-8'));
  for (const [key, val] of Object.entries(v2)) {
    if (key.includes('69838264') || val.exam_id?.includes('69838264')) {
      console.log(`\n=== mapping_v2 key=${key} ===`);
      console.log('exam_id:', val.exam_id);
      console.log('patient_name:', val.patient_name);
      console.log('images:', val.images?.length);
    }
  }

  // Also check original mapping
  const v1 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_cleaned.json', 'utf-8'));
  for (const [key, val] of Object.entries(v1)) {
    if (key.includes('69838264') || val.exam_id?.includes('69838264')) {
      console.log(`\n=== mapping_cleaned key=${key} ===`);
      console.log('exam_id:', val.exam_id);
      console.log('patient_name:', val.patient_name);
      console.log('images:', val.images?.length);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
