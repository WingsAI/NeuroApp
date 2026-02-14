const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

function normalize(name) {
  return name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  // Find patient
  const pat = await p.patient.findFirst({
    where: { name: { contains: 'FRANCISCO SERGIO', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  if (!pat) { console.log('Not found'); await p.$disconnect(); return; }

  console.log(`Patient: ${pat.name}`);
  console.log(`ID: ${pat.id}`);
  console.log(`CPF: ${pat.cpf}`);
  console.log(`BirthDate: ${pat.birthDate}`);
  console.log(`Gender: ${pat.gender}`);

  // Search download_state.json by name (fuzzy)
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const patNorm = normalize(pat.name);

  console.log('\n--- Search in download_state.json ---');
  let found = false;
  for (const [examId, data] of Object.entries(state)) {
    const stateNorm = normalize(data.patient_name || '');
    if (stateNorm.includes('FRANCISCO') && stateNorm.includes('SERGIO')) {
      found = true;
      console.log(`  ExamID: ${examId}`);
      console.log(`  Name: ${data.patient_name}`);
      console.log(`  CPF: ${data.cpf || 'null'}`);
      console.log(`  Birthday: ${data.birthday || 'null'}`);
      console.log(`  Expected images: ${data.expected_images}`);
      console.log(`  Image details: ${data.image_details ? data.image_details.length : 'none'}`);
      if (data.image_details) {
        data.image_details.forEach((img, i) => {
          console.log(`    [${i}] ${img.type} - ${img.uuid}`);
        });
      }
    }
  }
  if (!found) console.log('  NOT FOUND by name');

  // Search patient_details.json
  const detailsPath = path.join(__dirname, 'eyercloud_downloader', 'patient_details.json');
  const details = JSON.parse(fs.readFileSync(detailsPath, 'utf-8'));

  console.log('\n--- Search in patient_details.json ---');
  let foundDetail = false;
  for (const [id, d] of Object.entries(details)) {
    const dNorm = normalize(d.fullName || '');
    if (dNorm.includes('FRANCISCO') && dNorm.includes('SERGIO')) {
      foundDetail = true;
      console.log(`  ID: ${id}`);
      console.log(`  Name: ${d.fullName}`);
      console.log(`  CPF: ${d.cpf || 'null'}`);
      console.log(`  Gender: ${d.gender || 'null'}`);
      console.log(`  Birthday: ${d.birthday || 'null'}`);
    }
  }
  if (!foundDetail) console.log('  NOT FOUND');

  // Search in mapping files
  const mappingPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json');
  const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));

  console.log('\n--- Search in bytescale_mapping_v2.json ---');
  let foundMapping = false;
  for (const [key, data] of Object.entries(mapping)) {
    if (data.exam_id === pat.id || key.includes('FRANCISCO_SERGIO') ||
        (data.patient_name && normalize(data.patient_name).includes('FRANCISCO') && normalize(data.patient_name).includes('SERGIO'))) {
      foundMapping = true;
      console.log(`  Key: ${key}`);
      console.log(`  exam_id: ${data.exam_id}`);
      console.log(`  patient_name: ${data.patient_name}`);
      console.log(`  cpf: ${data.cpf || 'null'}`);
      console.log(`  images: ${data.images ? data.images.length : 0}`);
    }
  }
  if (!foundMapping) console.log('  NOT FOUND');

  // Show exam details
  for (const exam of pat.exams) {
    console.log(`\n--- Exam ${exam.id} ---`);
    console.log(`Images (${exam.images.length}):`);
    exam.images.forEach((img, i) => {
      const url = img.url ? decodeURIComponent(img.url).substring(0, 100) : 'no url';
      console.log(`  [${i}] ${img.id} (${img.type}) - ${url}`);
    });

    if (exam.report) {
      console.log(`\nReport selectedImages: ${JSON.stringify(exam.report.selectedImages)}`);
      const si = exam.report.selectedImages;
      if (si && typeof si === 'object') {
        const ids = new Set(exam.images.map(i => i.id));
        for (const eye of ['od', 'oe']) {
          if (si[eye]) {
            console.log(`  ${eye}: ${si[eye]} -> ${ids.has(si[eye]) ? '✅ EXISTS' : '❌ NOT FOUND'}`);
            // If the ID has index, check what image type it is
            const img = exam.images.find(i => i.id === si[eye]);
            if (img) {
              console.log(`    Type: ${img.type}, URL: ${img.url ? decodeURIComponent(img.url).substring(0, 80) : 'none'}`);
            }
          }
        }
      }
    }
  }

  // Check if the selected images are retinal images or anterior
  // OD should be a right eye image and OE should be a left eye image

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
