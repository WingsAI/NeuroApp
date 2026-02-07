/**
 * Compare EyerCloud patient list with DB patients
 * Uses the EyerCloud API data fetched via browser (XHR with {page: N})
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  // Get DB patients
  const dbPatients = await prisma.patient.findMany({ select: { id: true, name: true } });
  console.log('DB patients:', dbPatients.length);

  // Get EyerCloud patients via the same API the browser uses
  const http = require('https');

  // First we need to login - but we can use the download_state instead
  // Actually, let's use the download_state.json which has all patient names
  const state = require('./eyercloud_downloader/download_state.json');
  const statePatients = new Map();
  for (const [examId, details] of Object.entries(state.exam_details)) {
    const name = details.patient_name;
    if (!name || name === 'Desconhecido') continue;
    const norm = normalize(name);
    if (!statePatients.has(norm)) {
      statePatients.set(norm, { name, examIds: [], clinics: new Set() });
    }
    statePatients.get(norm).examIds.push(examId);
    if (details.clinic_name) statePatients.get(norm).clinics.add(details.clinic_name);
  }
  console.log('State unique named patients:', statePatients.size);

  // Normalize DB patient names
  const dbNameMap = new Map();
  for (const p of dbPatients) {
    const norm = normalize(p.name);
    dbNameMap.set(norm, p);
  }
  console.log('DB unique normalized names:', dbNameMap.size);

  // Find patients in state NOT in DB
  const missingFromDB = [];
  for (const [norm, data] of statePatients) {
    if (!dbNameMap.has(norm)) {
      missingFromDB.push(data);
    }
  }

  // Find patients in DB NOT in state (should be few/none)
  const extraInDB = [];
  for (const [norm, p] of dbNameMap) {
    if (!statePatients.has(norm)) {
      extraInDB.push(p);
    }
  }

  console.log('\n=== MISSING FROM DB (in EyerCloud state but not in DB) ===');
  console.log('Count:', missingFromDB.length);
  for (const p of missingFromDB) {
    console.log(`  ${p.name} | exams: ${p.examIds.join(', ')} | clinic: ${[...p.clinics].join(', ')}`);
  }

  console.log('\n=== EXTRA IN DB (in DB but not in EyerCloud state) ===');
  console.log('Count:', extraInDB.length);
  for (const p of extraInDB.slice(0, 10)) {
    console.log(`  ${p.name} (${p.id})`);
  }

  // Now the key question: these 451 EyerCloud patients include ones from
  // exams not yet downloaded. Let's check what the site's 451 maps to.
  // The state has 407 named patients. The site has 451. Diff = 44.
  // These 44 are patients whose exams haven't been downloaded yet.

  // Check: how many state patients are in DB?
  let stateInDB = 0;
  for (const [norm] of statePatients) {
    if (dbNameMap.has(norm)) stateInDB++;
  }
  console.log('\n=== SUMMARY ===');
  console.log('EyerCloud state named patients:', statePatients.size);
  console.log('DB patients:', dbPatients.length);
  console.log('State patients found in DB:', stateInDB);
  console.log('State patients MISSING from DB:', missingFromDB.length);
  console.log('DB patients not in state:', extraInDB.length);
  console.log('EyerCloud site total: 451');
  console.log('Gap (site - state):', 451 - statePatients.size, '(patients whose exams are not downloaded)');

  await prisma.$disconnect();
}

main().catch(console.error);
