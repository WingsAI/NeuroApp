/**
 * Compare EyerCloud site patient list (451) vs download_state vs DB
 * Identifies exactly which patients are missing and need to be downloaded.
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
  // 1. Load EyerCloud site patients (extracted from browser)
  const siteNames = require('./eyercloud_site_patients.json');
  console.log('=== SOURCE DATA ===');
  console.log('EyerCloud site patients:', siteNames.length);

  // Normalize site names
  const siteNorm = new Map();
  for (const name of siteNames) {
    const n = normalize(name);
    if (!siteNorm.has(n)) {
      siteNorm.set(n, []);
    }
    siteNorm.get(n).push(name);
  }
  console.log('Site unique normalized names:', siteNorm.size);

  // Show duplicates on site
  for (const [n, names] of siteNorm) {
    if (names.length > 1) {
      console.log(`  DUPLICATE on site: "${names[0]}" (${names.length}x)`);
    }
  }

  // 2. Load download_state patients
  const state = require('./eyercloud_downloader/download_state.json');
  const stateNorm = new Map();
  for (const [examId, details] of Object.entries(state.exam_details)) {
    const name = details.patient_name;
    if (!name || name === 'Desconhecido') continue;
    const n = normalize(name);
    if (!stateNorm.has(n)) {
      stateNorm.set(n, { name, examIds: [] });
    }
    stateNorm.get(n).examIds.push(examId);
  }
  console.log('State named patients:', stateNorm.size);

  // 3. Load DB patients
  const dbPatients = await prisma.patient.findMany({
    select: { id: true, name: true },
  });
  const dbNorm = new Map();
  for (const p of dbPatients) {
    const n = normalize(p.name);
    dbNorm.set(n, p);
  }
  console.log('DB patients:', dbPatients.length, '(unique normalized:', dbNorm.size + ')');

  // 4. Compare: site vs state
  const siteNotInState = [];
  const siteInState = [];
  for (const [n, names] of siteNorm) {
    if (stateNorm.has(n)) {
      siteInState.push(n);
    } else {
      siteNotInState.push(names[0]);
    }
  }

  // 5. Compare: site vs DB
  const siteNotInDB = [];
  const siteInDB = [];
  for (const [n, names] of siteNorm) {
    if (dbNorm.has(n)) {
      siteInDB.push(n);
    } else {
      siteNotInDB.push(names[0]);
    }
  }

  // 6. Compare: state vs DB
  const stateNotInDB = [];
  for (const [n, data] of stateNorm) {
    if (!dbNorm.has(n)) {
      stateNotInDB.push(data);
    }
  }

  // 7. Compare: DB vs site (extra in DB)
  const dbNotInSite = [];
  for (const [n, p] of dbNorm) {
    if (!siteNorm.has(n)) {
      dbNotInSite.push(p);
    }
  }

  console.log('\n=== COMPARISON RESULTS ===');
  console.log('Site patients found in state:', siteInState.length);
  console.log('Site patients NOT in state (never downloaded):', siteNotInState.length);
  console.log('Site patients found in DB:', siteInDB.length);
  console.log('Site patients NOT in DB:', siteNotInDB.length);
  console.log('State patients NOT in DB:', stateNotInDB.length);
  console.log('DB patients NOT on site:', dbNotInSite.length);

  if (siteNotInState.length > 0) {
    console.log('\n=== PATIENTS ON SITE BUT NEVER DOWNLOADED (need to download) ===');
    siteNotInState.sort().forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });
  }

  if (siteNotInDB.length > 0) {
    console.log('\n=== PATIENTS ON SITE BUT NOT IN DB ===');
    siteNotInDB.sort().forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });
  }

  if (stateNotInDB.length > 0) {
    console.log('\n=== PATIENTS IN STATE BUT NOT IN DB (downloaded but not imported) ===');
    stateNotInDB.forEach((data, i) => {
      console.log(`  ${i + 1}. ${data.name} (exams: ${data.examIds.join(', ')})`);
    });
  }

  if (dbNotInSite.length > 0) {
    console.log('\n=== PATIENTS IN DB BUT NOT ON SITE ===');
    dbNotInSite.forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.name} (${p.id})`);
    });
  }

  // Summary
  console.log('\n=== ACTION PLAN ===');
  console.log(`To reach 451 patients (449 unique names, 2 duplicate names):`);
  console.log(`  Currently in DB: ${dbNorm.size} unique names`);
  console.log(`  Need to download from EyerCloud: ${siteNotInState.length} patients`);
  console.log(`  Need to import from state: ${stateNotInDB.length} patients`);
  console.log(`  Total gap: ${siteNotInDB.length} patients`);

  await prisma.$disconnect();
}

main().catch(console.error);
