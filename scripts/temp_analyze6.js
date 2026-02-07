const state = require('./eyercloud_downloader/download_state.json');

// Show details of the 4 named state-only exams
const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');

function normalizeName(name) {
  return (name || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

// Resolve mapping IDs
const stateByName = {};
for (const [fullId, details] of Object.entries(state.exam_details)) {
  const norm = normalizeName(details.patient_name);
  if (!stateByName[norm]) stateByName[norm] = [];
  stateByName[norm].push(fullId);
}

const mappingIds = new Set();
for (const [folderKey, entry] of Object.entries(mapping)) {
  if (entry.exam_id && entry.exam_id.length === 24) {
    mappingIds.add(entry.exam_id);
    continue;
  }
  const shortId = entry.exam_id;
  const nameNorm = normalizeName(entry.patient_name);
  const candidates = stateByName[nameNorm] || [];
  const match = candidates.find(c => c.startsWith(shortId));
  if (match) {
    mappingIds.add(match);
  }
}

// Find the 4 state-only named exams
console.log('=== STATE-ONLY NAMED EXAMS ===');
for (const [examId, details] of Object.entries(state.exam_details)) {
  if (details.patient_name === 'Desconhecido') continue;
  if (!mappingIds.has(examId)) {
    console.log(`  ${details.patient_name} | ${examId} | ${details.clinic_name} | expected: ${details.expected_images} imgs`);
    console.log(`    birthday: ${details.birthday}, cpf: ${details.cpf}, gender: ${details.gender}`);
  }
}

// Show Desconhecido details
console.log('\n=== DESCONHECIDO EXAMS ===');
let descCount = 0;
for (const [examId, details] of Object.entries(state.exam_details)) {
  if (details.patient_name !== 'Desconhecido') continue;
  descCount++;
  console.log(`  ${examId} | ${details.clinic_name} | expected: ${details.expected_images} imgs | ${details.exam_date}`);
}
console.log(`Total Desconhecido: ${descCount}`);

// EyerCloud has 456 exams, 451 patients
// We have 433 in state. 456 - 433 = 23 missing
// From the 433: 407 named + 26 Desconhecido
// If we include Desconhecido: 407 exams + 26 = 433 exams, ~402 patients + some Desconhecido
// Target: 456 exams = 433 downloaded + 23 not downloaded
// Target: 451 patients = includes Desconhecido as separate patient(s)?
console.log('\n=== ANALYSIS ===');
console.log('Named exams in state:', 407);
console.log('Desconhecido exams:', 26);
console.log('Not downloaded:', 23);
console.log('Total:', 407 + 26 + 23, '(should be 456)');
console.log('Named unique patients:', 402);
console.log('If Desconhecido = 1 patient: 402 + 1 = 403 patients');
console.log('Missing patients to reach 451:', 451 - 403);
// The 48 missing patients must come from the 23 not-downloaded exams + possibly Desconhecido being multiple patients
