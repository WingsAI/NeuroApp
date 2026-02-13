const fs = require('fs');

// Check all mapping files for CPF data
for (const file of [
  'bytescale_mapping.json',
  'scripts/eyercloud_downloader/bytescale_mapping_cleaned.json',
  'scripts/eyercloud_downloader/bytescale_mapping_v2.json',
  'public/bytescale_mapping.json'
]) {
  try {
    const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const entries = Object.entries(d);
    let hasCpf = 0;
    let sample = null;
    for (const [k, v] of entries) {
      if (v.cpf && v.cpf.trim() && v.cpf !== 'PENDENTE' && v.cpf !== '') {
        hasCpf++;
        if (!sample) sample = { key: k, cpf: v.cpf, name: v.patient_name };
      }
    }
    console.log(`${file}: ${entries.length} entries, ${hasCpf} with CPF`);
    if (sample) console.log(`  Sample: ${sample.name}: ${sample.cpf}`);
  } catch (e) {
    console.log(`${file}: ${e.message}`);
  }
}

// Check download_state
const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));
let stateCpf = 0;
let stateSample = null;
for (const [k, v] of Object.entries(state)) {
  if (v.cpf && v.cpf.trim() && v.cpf !== '') {
    stateCpf++;
    if (!stateSample) stateSample = { name: v.patient_name, cpf: v.cpf };
  }
}
console.log(`\ndownload_state.json: ${Object.keys(state).length} entries, ${stateCpf} with CPF`);
if (stateSample) console.log(`  Sample: ${stateSample.name}: ${stateSample.cpf}`);

// Check patient_details
const details = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/patient_details.json', 'utf-8'));
let detailsCpf = 0;
let detailsSample = null;
for (const [k, v] of Object.entries(details)) {
  if (v.cpf && v.cpf.trim() && v.cpf !== '') {
    detailsCpf++;
    if (!detailsSample) detailsSample = { name: v.fullName || v.name, cpf: v.cpf };
  }
}
console.log(`\npatient_details.json: ${Object.keys(details).length} entries, ${detailsCpf} with CPF`);
if (detailsSample) console.log(`  Sample: ${detailsSample.name}: ${detailsSample.cpf}`);

// Key question: are those 388 numeric CPFs found in patient_details.json?
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    where: { cpf: { not: null } },
    select: { name: true, cpf: true }
  });

  // Build details CPF lookup by name
  const detailsCpfByName = {};
  for (const [k, v] of Object.entries(details)) {
    const name = (v.fullName || v.name || '').toUpperCase().trim();
    if (name && v.cpf) detailsCpfByName[name] = v.cpf;
  }

  let matchCount = 0;
  let noMatchCount = 0;
  const noMatchSamples = [];

  for (const p of patients) {
    const cpf = (p.cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11) continue;

    const detCpf = (detailsCpfByName[p.name.toUpperCase().trim()] || '').replace(/\D/g, '');
    if (detCpf === cpf) {
      matchCount++;
    } else {
      noMatchCount++;
      if (noMatchSamples.length < 10) {
        noMatchSamples.push({ name: p.name, dbCpf: p.cpf, detCpf: detCpf || '(not in details)' });
      }
    }
  }

  console.log(`\nDB numeric CPFs matching patient_details.json by name: ${matchCount}`);
  console.log(`DB numeric CPFs NOT matching: ${noMatchCount}`);
  if (noMatchSamples.length > 0) {
    console.log('Samples:');
    noMatchSamples.forEach(s => console.log(`  ${s.name}: DB=${s.dbCpf} Details=${s.detCpf}`));
  }

  await prisma.$disconnect();
}

main();
