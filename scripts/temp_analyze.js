const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');
const state = require('./eyercloud_downloader/download_state.json');

// Analyze mapping
const examIds = new Set();
const patientsByName = new Map();
let shortCount = 0, longCount = 0;

for (const [key, entry] of Object.entries(mapping)) {
  examIds.add(entry.exam_id);
  const name = entry.patient_name;
  if (!patientsByName.has(name)) patientsByName.set(name, []);
  patientsByName.get(name).push({ key, examId: entry.exam_id, imgCount: entry.images ? entry.images.length : 0 });
  if (entry.exam_id.length === 8) shortCount++;
  else if (entry.exam_id.length === 24) longCount++;
}

console.log('=== MAPPING FILE ===');
console.log('Total entries:', Object.keys(mapping).length);
console.log('Unique exam_ids:', examIds.size);
console.log('Unique patient names:', patientsByName.size);
console.log('Short exam_ids (8 chars):', shortCount);
console.log('Long exam_ids (24 chars):', longCount);

// Entries with short IDs
const shortEntries = Object.entries(mapping).filter(([k, v]) => v.exam_id.length === 8);
console.log('\nEntries with short exam_id:');
shortEntries.forEach(([k, v]) => {
  console.log(' ', v.patient_name, '|', v.exam_id, '|', (v.images ? v.images.length : 0), 'imgs');
});

// Cross-reference: state has 433 exams, mapping has 322. What's in state but not mapping?
const stateExamIds = new Set(Object.keys(state.exam_details));
const mappingExamIds = new Set();
for (const entry of Object.values(mapping)) {
  if (entry.exam_id.length === 24) mappingExamIds.add(entry.exam_id);
}

console.log('\n=== STATE vs MAPPING ===');
console.log('State exam count:', stateExamIds.size);
console.log('Mapping long exam_ids:', mappingExamIds.size);

const inStateNotMapping = [...stateExamIds].filter(id => !mappingExamIds.has(id));
console.log('In state but NOT in mapping (long IDs):', inStateNotMapping.length);
inStateNotMapping.slice(0, 10).forEach(id => {
  const d = state.exam_details[id];
  console.log(' ', d.patient_name, '|', id, '|', d.clinic_name);
});

// How many unique patients in state (excluding "Desconhecido")?
const statePatients = new Map();
for (const [id, d] of Object.entries(state.exam_details)) {
  if (d.patient_name === 'Desconhecido') continue;
  if (!statePatients.has(d.patient_name)) statePatients.set(d.patient_name, []);
  statePatients.get(d.patient_name).push(id);
}
console.log('\nUnique patient names in state (excl Desconhecido):', statePatients.size);

// Target: 451 patients, 456 exams
// State has 433 exams. EyerCloud has 456. Delta: 23 exams not downloaded yet.
// State has ~402 unique patient names (excl Desconhecido) + 26 Desconhecido exams
console.log('\n=== GAP TO EYERCLOUD TARGET ===');
console.log('EyerCloud target: 451 patients, 456 exams');
console.log('State: 433 exams,', statePatients.size, 'named patients + 26 Desconhecido exams');
console.log('Missing from state:', 456 - 433, 'exams');

// DB currently has 298 patients, 313 exams
// Mapping has 322 unique exam_ids mapping to 401 unique patient names
// But mapping has entries with short IDs that are ambiguous

// Can we resolve short IDs using state?
console.log('\n=== RESOLVING SHORT IDs FROM STATE ===');
const shortIdsInMapping = new Set(shortEntries.map(([k, v]) => v.exam_id));
console.log('Unique short exam_ids in mapping:', shortIdsInMapping.size);

for (const shortId of shortIdsInMapping) {
  // Find state entries that start with this prefix
  const matches = [...stateExamIds].filter(id => id.startsWith(shortId));
  console.log(`\nShort ID ${shortId} matches in state:`);
  matches.forEach(id => {
    const d = state.exam_details[id];
    console.log(' ', d.patient_name, '|', id);
  });

  // Also find mapping entries with this short ID
  const mappingEntries = shortEntries.filter(([k, v]) => v.exam_id === shortId);
  console.log(`  Mapping entries with this ID:`);
  mappingEntries.forEach(([k, v]) => {
    console.log('   ', v.patient_name, '|', k);
  });
}
