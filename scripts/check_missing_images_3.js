const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf8'));
  const imageTypes = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/image_types.json', 'utf8'));
  const mappingV2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf8'));

  const examIds = ['697d03dd565494aed21c07c4', '697d03df7927d48de9d88c52', '697d03e48bc8fc9984f742b0'];

  for (const eid of examIds) {
    const exam = state[eid];
    console.log('========================================');
    console.log((exam ? exam.patient_name : 'Unknown') + ' (exam: ' + eid + ')');

    // EyerCloud state
    if (exam) {
      console.log('\n  EyerCloud expected_images:', exam.expected_images);
      if (exam.image_details) {
        console.log('  EyerCloud image_details (' + exam.image_details.length + '):');
        for (const img of exam.image_details) {
          console.log('    UUID: ' + img.uuid + ' type=' + img.type);
        }
      }
    }

    // Mapping v2
    let mappingImages = [];
    for (const [key, entry] of Object.entries(mappingV2)) {
      if (entry.exam_id === eid) {
        mappingImages = entry.images || [];
        console.log('\n  Mapping v2 entry (' + key + '): ' + mappingImages.length + ' images');
        for (const img of mappingImages) {
          const url = img.bytescale_url;
          const decoded = decodeURIComponent(url);
          const filename = decoded.split('/').pop().split('?')[0];
          const uuid = filename.replace('.jpg', '');
          const apiType = imageTypes[uuid] || 'N/A';
          console.log('    ' + filename + ' mappingType=' + (img.type || 'N/A') + ' apiType=' + apiType);
        }
        break;
      }
    }

    // DB images
    const dbImages = await p.examImage.findMany({ where: { examId: eid } });
    console.log('\n  DB images (' + dbImages.length + '):');
    for (const img of dbImages) {
      const decoded = decodeURIComponent(img.url);
      const filename = decoded.split('/').pop().split('?')[0];
      console.log('    ' + img.id + ' type=' + img.type + ' file=' + filename);
    }

    // Find images in mapping but not in DB
    const dbUrls = new Set(dbImages.map(i => {
      const decoded = decodeURIComponent(i.url);
      return decoded.split('/').pop().split('?')[0];
    }));

    const missing = mappingImages.filter(img => {
      const decoded = decodeURIComponent(img.bytescale_url);
      const filename = decoded.split('/').pop().split('?')[0];
      return !dbUrls.has(filename);
    });

    if (missing.length > 0) {
      console.log('\n  MISSING from DB (in mapping but not in DB): ' + missing.length);
      for (const img of missing) {
        const decoded = decodeURIComponent(img.bytescale_url);
        const filename = decoded.split('/').pop().split('?')[0];
        const uuid = filename.replace('.jpg', '');
        const apiType = imageTypes[uuid] || 'N/A';
        console.log('    ' + filename + ' apiType=' + apiType);
        console.log('      URL: ' + img.bytescale_url);
      }
    }

    // Also check: images in EyerCloud image_details but not in mapping
    if (exam && exam.image_details) {
      const mappingUUIDs = new Set(mappingImages.map(img => {
        const decoded = decodeURIComponent(img.bytescale_url);
        return decoded.split('/').pop().split('?')[0].replace('.jpg', '');
      }));
      const notInMapping = exam.image_details.filter(d => !mappingUUIDs.has(d.uuid));
      if (notInMapping.length > 0) {
        console.log('\n  In EyerCloud but NOT in mapping (never uploaded to Bytescale): ' + notInMapping.length);
        for (const img of notInMapping) {
          console.log('    UUID: ' + img.uuid + ' type=' + img.type);
        }
      }
    }

    console.log('');
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
