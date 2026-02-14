const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Load EyerCloud data
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf8'));
  const imageTypes = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/image_types.json', 'utf8'));
  const mappingV2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf8'));

  const examIds = ['697d03dd565494aed21c07c4', '697d03df7927d48de9d88c52', '697d03e48bc8fc9984f742b0'];

  for (const eid of examIds) {
    const exam = state[eid];
    console.log('========================================');
    console.log((exam ? exam.patient_name : 'Unknown') + ' (exam: ' + eid + ')');

    // EyerCloud image details
    if (exam && exam.image_details) {
      console.log('\n  EyerCloud image_details:');
      for (const img of exam.image_details) {
        console.log(`    UUID: ${img.uuid} type=${img.type} laterality=${img.laterality || 'N/A'}`);
      }
    }

    // Check image_types.json for this exam's images
    const dbImages = await p.examImage.findMany({ where: { examId: eid } });
    console.log('\n  DB images:');
    for (const img of dbImages) {
      const decoded = decodeURIComponent(img.url);
      const filename = decoded.split('/').pop().split('?')[0].replace('.jpg', '');
      const apiType = imageTypes[filename];
      console.log(`    ${img.id} dbType=${img.type} apiType=${apiType || 'N/A'} url=...${decoded.slice(-60)}`);
    }

    // Check mapping
    const mappingEntry = Object.values(mappingV2).find(e => e.exam_id === eid);
    if (mappingEntry) {
      console.log('\n  Mapping images:');
      for (const img of mappingEntry.images) {
        console.log(`    ${img.bytescale_url.split('/').pop().split('?')[0]} type=${img.type || 'N/A'}`);
      }
    }

    console.log('');
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
