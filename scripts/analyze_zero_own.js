const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const exams = await prisma.exam.findMany({
    include: {
      images: true,
      patient: { select: { name: true, id: true } }
    }
  });

  const v2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf-8'));
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));

  // Find exams where ALL images are "foreign" (0 own)
  for (const exam of exams) {
    if (exam.images.length === 0) continue;

    const patientName = exam.patient?.name || '';
    let ownCount = 0;
    let foreignCount = 0;
    const foreignFolders = new Set();

    for (const img of exam.images) {
      if (!img.url) continue;
      const match = img.url.match(/\/patients\/([^/]+)\//);
      if (!match) continue;
      const folderName = decodeURIComponent(match[1]);
      const folderParts = folderName.match(/^(.+)_([a-f0-9]{8})$/);
      if (!folderParts) continue;
      const folderPatientName = folderParts[1].replace(/_/g, ' ');
      if (folderPatientName.toUpperCase().normalize('NFC') === patientName.toUpperCase().normalize('NFC')) {
        ownCount++;
      } else {
        foreignCount++;
        foreignFolders.add(folderName);
      }
    }

    if (foreignCount > 0 && ownCount === 0) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Patient: ${patientName} (ID: ${exam.patientId})`);
      console.log(`Exam: ${exam.id} | eyerCloudId: ${exam.eyerCloudId}`);
      console.log(`Images: ${exam.images.length} (all foreign)`);
      console.log(`Foreign folders: ${[...foreignFolders].join(', ')}`);

      // Check mapping v2 for this patient
      const matchingV2 = Object.entries(v2).filter(([key, val]) =>
        val.exam_id === exam.eyerCloudId ||
        val.exam_id === exam.eyerCloudId?.substring(0, 8) ||
        key.includes(exam.eyerCloudId?.substring(0, 8))
      );
      if (matchingV2.length > 0) {
        for (const [key, val] of matchingV2) {
          console.log(`  mapping_v2: key=${key} exam_id=${val.exam_id} patient=${val.patient_name} images=${val.images?.length}`);
        }
      }

      // Check download_state
      const stateEntry = state[exam.eyerCloudId];
      if (stateEntry) {
        console.log(`  download_state: patient=${stateEntry.patient_name} folder=${stateEntry.folder_name} expected=${stateEntry.expected_images}`);
      }

      // Check if the folder name actually matches the download_state folder
      if (stateEntry?.folder_name) {
        const stateFolderPatient = stateEntry.folder_name.replace(/_[a-f0-9]{8}$/, '').replace(/_/g, ' ');
        console.log(`  State folder patient: "${stateFolderPatient}" vs DB patient: "${patientName}"`);
        if (stateFolderPatient.toUpperCase() !== patientName.toUpperCase()) {
          console.log(`  >>> NAME MISMATCH between state folder and DB!`);
        }
      }

      // Show a sample of the foreign image URLs
      const sample = exam.images.slice(0, 3);
      sample.forEach(img => {
        const m = img.url.match(/\/patients\/([^/]+)\//);
        console.log(`  Sample: ${decodeURIComponent(m ? m[1] : '???')}`);
      });
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
