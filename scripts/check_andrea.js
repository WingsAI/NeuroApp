const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patient = await prisma.patient.findUnique({
    where: { id: '69838264a0e9c8adf6826e58' },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  console.log('Patient:', patient.name);
  console.log('Total exams:', patient.exams.length);

  let totalImages = 0;
  for (const exam of patient.exams) {
    console.log('\nExam:', exam.id);
    console.log('EyerCloud ID:', exam.eyerCloudId);
    console.log('Status:', exam.status);
    console.log('Has Report:', !!exam.report);
    console.log('Images:', exam.images.length);
    totalImages += exam.images.length;

    exam.images.forEach((img, i) => {
      console.log(`  ${i + 1}. id=${img.id} type=${img.type}`);
      console.log(`     url=${img.url}`);
    });
  }

  console.log('\nTotal images across all exams:', totalImages);

  // Check for duplicate URLs
  const allUrls = patient.exams.flatMap(e => e.images.map(i => i.url));
  const urlCounts = {};
  allUrls.forEach(u => { urlCounts[u] = (urlCounts[u] || 0) + 1; });
  const dupes = Object.entries(urlCounts).filter(([, c]) => c > 1);
  if (dupes.length > 0) {
    console.log('\nDUPLICATE URLs found:');
    dupes.forEach(([url, count]) => console.log(`  ${count}x ${url}`));
  }

  // Check for duplicate UUIDs in image IDs
  const uuids = patient.exams.flatMap(e => e.images.map(i => {
    const match = i.imageUrl.match(/\/([a-f0-9-]{36})/);
    return match ? match[1] : i.imageUrl;
  }));
  const uuidCounts = {};
  uuids.forEach(u => { uuidCounts[u] = (uuidCounts[u] || 0) + 1; });
  const uuidDupes = Object.entries(uuidCounts).filter(([, c]) => c > 1);
  if (uuidDupes.length > 0) {
    console.log('\nDUPLICATE UUIDs found:');
    uuidDupes.forEach(([uuid, count]) => console.log(`  ${count}x ${uuid}`));
  }

  // Cross-reference with download_state
  const fs = require('fs');
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));
  const examEntry = state['69838264a0e9c8adf6826e58'];
  if (examEntry) {
    console.log('\n=== download_state.json ===');
    console.log('Expected images:', examEntry.expected_images);
    if (examEntry.image_details) {
      console.log('Image details:', examEntry.image_details.length);
      examEntry.image_details.forEach((img, i) => {
        console.log(`  ${i + 1}. uuid=${img.uuid} type=${img.type} lat=${img.laterality}`);
      });
    }
  }

  // Check bytescale_mapping_v2.json
  const v2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf-8'));
  const v2Entries = Object.entries(v2).filter(([key, val]) => {
    return val.exam_id === '69838264a0e9c8adf6826e58' ||
           val.patient_name?.toUpperCase().includes('GONÇALVES');
  });
  if (v2Entries.length > 0) {
    console.log('\n=== bytescale_mapping_v2.json ===');
    v2Entries.forEach(([key, val]) => {
      console.log(`Key: ${key}`);
      console.log(`exam_id: ${val.exam_id}`);
      console.log(`patient_name: ${val.patient_name}`);
      console.log(`images: ${val.images?.length}`);
      val.images?.forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.url}`);
      });
    });
  } else {
    console.log('\nNot found in bytescale_mapping_v2.json');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
