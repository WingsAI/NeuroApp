const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function findMissingDownloads() {
  console.log('=== Verificando exames com imagens faltando ===\n');

  // Load download_state
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  // Load bytescale mapping
  const mappingPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json');
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

  // Get all patients with exams
  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: true
        }
      }
    }
  });

  console.log(`Total pacientes: ${patients.length}\n`);

  const missing = [];

  for (const patient of patients) {
    for (const exam of patient.exams) {
      if (!exam.eyerCloudId) continue;

      const stateData = state.exam_details[exam.eyerCloudId];
      const mappingData = mapping[exam.eyerCloudId];

      if (stateData) {
        const expectedImages = stateData.expected_images || 0;
        const dbImages = exam.images.length;
        const mappingImages = mappingData?.images?.length || 0;

        // Check if images are missing
        if (expectedImages > 0 && dbImages === 0 && mappingImages === 0) {
          missing.push({
            patient: patient.name,
            examId: exam.eyerCloudId,
            expectedImages,
            dbImages,
            mappingImages,
            examDate: exam.examDate?.toISOString().split('T')[0] || 'N/A',
            location: exam.location
          });
        }
      }
    }
  }

  console.log(`=== Exames com imagens faltando ===\n`);
  console.log(`Total: ${missing.length}\n`);

  if (missing.length > 0) {
    missing.forEach((m, idx) => {
      console.log(`${idx + 1}. ${m.patient}`);
      console.log(`   Exam ID: ${m.examId}`);
      console.log(`   Data: ${m.examDate} | Local: ${m.location}`);
      console.log(`   Esperadas: ${m.expectedImages} | No DB: ${m.dbImages} | No Mapping: ${m.mappingImages}`);
      console.log();
    });

    // Save to file for batch download
    const missingFile = path.join(__dirname, 'missing_images.json');
    fs.writeFileSync(missingFile, JSON.stringify(missing, null, 2));
    console.log(`\nLista salva em: ${missingFile}`);
  } else {
    console.log('✓ Nenhum exame com imagens faltando encontrado!');
  }

  await prisma.$disconnect();
}

findMissingDownloads().catch(console.error);
