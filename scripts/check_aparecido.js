const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function checkAparecido() {
  console.log('=== Investigando APARECIDO ROBERTO LOCAISE ===\n');

  // Find patient in DB
  const patient = await prisma.patient.findFirst({
    where: {
      name: {
        contains: 'APARECIDO ROBERTO LOCAISE',
        mode: 'insensitive'
      }
    },
    include: {
      exams: {
        include: {
          images: true
        }
      }
    }
  });

  if (!patient) {
    console.log('❌ Paciente não encontrado no banco de dados');
    return;
  }

  console.log('✓ Paciente encontrado:');
  console.log(`  ID: ${patient.id}`);
  console.log(`  Nome: ${patient.name}`);
  console.log(`  Total de exames: ${patient.exams.length}\n`);

  for (const exam of patient.exams) {
    console.log(`Exame ${exam.id}:`);
    console.log(`  eyerCloudId: ${exam.eyerCloudId}`);
    console.log(`  Data: ${exam.examDate?.toISOString().split('T')[0] || 'N/A'}`);
    console.log(`  Location: ${exam.location}`);
    console.log(`  Imagens no DB: ${exam.images.length}`);
    if (exam.images.length > 0) {
      exam.images.forEach((img, idx) => {
        console.log(`    ${idx + 1}. ${img.type} - ${img.url?.substring(0, 60)}...`);
      });
    }
    console.log();
  }

  // Check in download_state.json
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    console.log('=== Verificando download_state.json ===\n');

    for (const exam of patient.exams) {
      const examData = state.exam_details[exam.eyerCloudId];
      if (examData) {
        console.log(`Exam ${exam.eyerCloudId} em download_state:`);
        console.log(`  Patient: ${examData.patient_name}`);
        console.log(`  Expected images: ${examData.expected_images || 'N/A'}`);
        console.log(`  Clinic: ${examData.clinic_name}`);
        console.log(`  Date: ${examData.exam_date}`);
        console.log();
      }
    }
  }

  // Check in bytescale mapping
  const mappingPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json');
  if (fs.existsSync(mappingPath)) {
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

    console.log('=== Verificando bytescale_mapping_v2.json ===\n');

    for (const exam of patient.exams) {
      const mappingEntry = mapping[exam.eyerCloudId];
      if (mappingEntry) {
        console.log(`Exam ${exam.eyerCloudId} em bytescale_mapping_v2:`);
        console.log(`  Patient: ${mappingEntry.patient_name}`);
        console.log(`  Images uploaded: ${mappingEntry.images?.length || 0}`);
        if (mappingEntry.images && mappingEntry.images.length > 0) {
          mappingEntry.images.forEach((img, idx) => {
            console.log(`    ${idx + 1}. ${img.type || 'UNKNOWN'} - ${img.bytescale_url?.substring(0, 60)}...`);
          });
        }
        console.log();
      } else {
        console.log(`❌ Exam ${exam.eyerCloudId} NÃO encontrado em bytescale_mapping_v2\n`);
      }
    }
  }

  await prisma.$disconnect();
}

checkAparecido().catch(console.error);
