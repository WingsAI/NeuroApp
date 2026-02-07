const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');
const state = require('./eyercloud_downloader/download_state.json');

function normalizeName(name) {
  return (name || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

// Build state name→ID index
const stateByName = {};
for (const [fullId, details] of Object.entries(state.exam_details)) {
  const norm = normalizeName(details.patient_name);
  if (!stateByName[norm]) stateByName[norm] = [];
  stateByName[norm].push(fullId);
}

// Resolve ALL mapping short IDs first (in memory)
for (const [folderKey, entry] of Object.entries(mapping)) {
  if (entry.exam_id && entry.exam_id.length === 24) continue;
  const shortId = entry.exam_id;
  const nameNorm = normalizeName(entry.patient_name);
  const candidates = stateByName[nameNorm] || [];
  const match = candidates.find(c => c.startsWith(shortId));
  if (match) {
    entry.exam_id = match;
  }
}

// Now count ALL unique exam IDs across both mapping and state
const allExamIds = new Set();
const allPatientNames = new Set();

// From mapping
for (const entry of Object.values(mapping)) {
  if (entry.exam_id && entry.exam_id.length === 24) {
    allExamIds.add(entry.exam_id);
    allPatientNames.add(normalizeName(entry.patient_name));
  }
}
console.log('Unique long exam IDs in mapping (after resolve):', allExamIds.size);

// From state
let stateOnly = 0;
for (const [examId, details] of Object.entries(state.exam_details)) {
  if (details.patient_name === 'Desconhecido') continue;
  if (!allExamIds.has(examId)) {
    stateOnly++;
    allPatientNames.add(normalizeName(details.patient_name));
  }
  allExamIds.add(examId);
}
console.log('Exams only in state (not in mapping):', stateOnly);
console.log('Total unique exam IDs (mapping + state):', allExamIds.size);
console.log('Total unique patient names:', allPatientNames.size);

// Check Desconhecido count
const desconhecido = Object.values(state.exam_details).filter(d => d.patient_name === 'Desconhecido');
console.log('Desconhecido exams in state:', desconhecido.length);
console.log('Total with Desconhecido:', allExamIds.size + desconhecido.length);

// Target: 451 patients, 456 exams
// If we have 402 unique patient names + Desconhecido(?), we're short
// Maybe some "Desconhecido" are actual patients?

// Let's see the exact breakdown
// Mapping entries (557) map to 403 unique exam IDs
// State has 433 exam IDs
// Union = ?
console.log('\n=== EXACT OVERLAP ===');
const mappingIds = new Set();
for (const entry of Object.values(mapping)) {
  if (entry.exam_id && entry.exam_id.length === 24) mappingIds.add(entry.exam_id);
}
const stateIds = new Set(Object.keys(state.exam_details));

const inBoth = [...mappingIds].filter(id => stateIds.has(id));
const mappingOnly = [...mappingIds].filter(id => !stateIds.has(id));
const stateOnlyIds = [...stateIds].filter(id => !mappingIds.has(id));

console.log('In mapping (long): ', mappingIds.size);
console.log('In state: ', stateIds.size);
console.log('In both: ', inBoth.length);
console.log('Mapping only: ', mappingOnly.length);
console.log('State only: ', stateOnlyIds.length);
console.log('Union: ', new Set([...mappingIds, ...stateIds]).size);

// Check mapping-only entries
if (mappingOnly.length > 0) {
  console.log('\nMapping-only exam IDs:');
  for (const id of mappingOnly) {
    const entry = Object.values(mapping).find(e => e.exam_id === id);
    console.log(`  ${entry?.patient_name} | ${id}`);
  }
}

// State only count (excluding Desconhecido)
const stateOnlyNamed = stateOnlyIds.filter(id => state.exam_details[id].patient_name !== 'Desconhecido');
const stateOnlyDesconhecido = stateOnlyIds.filter(id => state.exam_details[id].patient_name === 'Desconhecido');
console.log('\nState-only named patients:', stateOnlyNamed.length);
console.log('State-only Desconhecido:', stateOnlyDesconhecido.length);
