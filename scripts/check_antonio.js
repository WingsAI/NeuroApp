const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find Antonio Benedito Santos
  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'ANTONIO', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  for (const p of patients) {
    if (p.name.toUpperCase().includes('BENEDITO')) {
      console.log('=== PATIENT ===');
      console.log('ID:', p.id);
      console.log('Name:', p.name);
      console.log('Exams:', p.exams.length);

      for (const exam of p.exams) {
        console.log('\nExam:', exam.id);
        console.log('EyerCloud ID:', exam.eyerCloudId);
        console.log('Status:', exam.status);
        console.log('Has Report:', !!exam.report);
        console.log('Images:', exam.images.length);
        exam.images.forEach((img, i) => {
          console.log(`  ${i + 1}. id=${img.id} type=${img.type} url=${img.url}`);
        });
      }
    }
  }

  // Also check: does any other exam also use folder _69838264?
  const allImages = await prisma.examImage.findMany({
    where: { url: { contains: 'ANT%C3%94NIO_BENEDITO_SANTOS_69838264' } },
    include: { Exam: true }
  });

  console.log('\n=== All images with ANTONIO_BENEDITO_SANTOS_69838264 URL ===');
  console.log('Total:', allImages.length);
  const examIds = [...new Set(allImages.map(i => i.examId))];
  console.log('Exam IDs:', examIds);

  // Check download_state for Antonio
  const fs = require('fs');
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));
  for (const [examId, data] of Object.entries(state)) {
    if (data.patient_name?.toUpperCase().includes('BENEDITO')) {
      console.log('\n=== download_state.json ===');
      console.log('Exam ID:', examId);
      console.log('Patient:', data.patient_name);
      console.log('Folder:', data.folder_name);
      console.log('Expected images:', data.expected_images);
      if (data.image_details) {
        console.log('Image details:');
        data.image_details.forEach((img, i) => {
          console.log(`  ${i + 1}. uuid=${img.uuid} type=${img.type} lat=${img.laterality}`);
        });
      }
    }
  }

  // Check bytescale_mapping_v2 for Antonio
  const v2 = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_v2.json', 'utf-8'));
  for (const [key, val] of Object.entries(v2)) {
    if (val.patient_name?.toUpperCase().includes('BENEDITO') || key.includes('BENEDITO')) {
      console.log('\n=== bytescale_mapping_v2.json ===');
      console.log('Key:', key);
      console.log('exam_id:', val.exam_id);
      console.log('patient_name:', val.patient_name);
      console.log('images:', val.images?.length);
      val.images?.forEach((img, i) => {
        console.log(`  ${i + 1}. ${img.url}`);
      });
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
