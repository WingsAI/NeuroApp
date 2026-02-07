/**
 * fix_desconhecido.js - Fix 26 "Desconhecido" exams in download_state
 * ====================================================================
 * These exams were downloaded without patient names. We now know the real
 * names from the EyerCloud API.
 *
 * Also checks the bytescale_mapping_cleaned.json for these exams.
 *
 * Usage:
 *   node scripts/fix_desconhecido.js              # Preview
 *   node scripts/fix_desconhecido.js --execute     # Apply changes
 */

const fs = require('fs');
const path = require('path');

const execute = process.argv.includes('--execute');
console.log(execute ? '=== MODO EXECUCAO ===' : '=== MODO PREVIEW ===');

// Load data
const missing = require('./missing_47_patients.json');
const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const mappingPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

// Build exam -> real name map from our missing_47 data
const examToName = {};
for (const p of missing.patients) {
  examToName[p.examId] = p.name;
}

// Find Desconhecido exams that have real names
const fixes = [];
for (const [examId, details] of Object.entries(state.exam_details)) {
  if (details.patient_name === 'Desconhecido' && examToName[examId]) {
    fixes.push({
      examId,
      oldName: details.patient_name,
      newName: examToName[examId],
      folderName: details.folder_name,
      expectedImages: details.expected_images,
      hasInMapping: !!mapping[details.folder_name] || !!mapping[examId]
    });
  }
}

console.log(`\nDesconhecido exams with real names: ${fixes.length}`);
console.log('\n--- FIXES ---');
for (const f of fixes) {
  console.log(`  ${f.examId.substring(0, 16)} | ${f.oldName} -> ${f.newName}`);
  console.log(`    folder: ${f.folderName} | images: ${f.expectedImages} | in mapping: ${f.hasInMapping}`);
}

// Check remaining Desconhecido (without real names)
const remainingDesc = Object.entries(state.exam_details)
  .filter(([id, d]) => d.patient_name === 'Desconhecido' && !examToName[id]);
console.log(`\nRemaining Desconhecido (no match): ${remainingDesc.length}`);
for (const [id, d] of remainingDesc) {
  console.log(`  ${id} | folder: ${d.folder_name} | images: ${d.expected_images}`);
}

// Check mapping for these exams
console.log('\n--- MAPPING CHECK ---');
let inMapping = 0;
let notInMapping = 0;
for (const f of fixes) {
  // Check various key formats in mapping
  const keys = [f.folderName, f.examId, `Desconhecido_${f.examId.substring(0, 8)}`];
  let found = null;
  for (const k of keys) {
    if (mapping[k]) { found = k; break; }
  }
  // Also search by exam_id field
  if (!found) {
    for (const [k, v] of Object.entries(mapping)) {
      if (v.exam_id === f.examId) { found = k; break; }
    }
  }
  if (found) {
    const m = mapping[found];
    console.log(`  FOUND: ${f.examId.substring(0, 16)} -> key "${found}" | images: ${m.images?.length || 0} | name in mapping: ${m.patient_name}`);
    inMapping++;
  } else {
    console.log(`  NOT FOUND: ${f.examId.substring(0, 16)} (${f.newName})`);
    notInMapping++;
  }
}
console.log(`\nIn mapping: ${inMapping}, Not in mapping: ${notInMapping}`);

if (execute) {
  console.log('\n=== APPLYING FIXES ===');

  // Fix download_state
  let stateFixed = 0;
  for (const f of fixes) {
    const detail = state.exam_details[f.examId];
    if (detail) {
      detail.patient_name = f.newName;
      // Also update folder_name to use real name
      const safeName = f.newName.replace(/[<>:"/\\|?*]/g, '_').replace(/ /g, '_');
      detail.folder_name_original = detail.folder_name; // keep original for reference
      // Don't rename folder_name yet - the actual folder on disk has the old name
      stateFixed++;
    }
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 4), 'utf8');
  console.log(`Fixed ${stateFixed} entries in download_state.json`);

  // Fix mapping
  let mappingFixed = 0;
  for (const f of fixes) {
    for (const [k, v] of Object.entries(mapping)) {
      if (v.exam_id === f.examId && v.patient_name === 'Desconhecido') {
        v.patient_name = f.newName;
        mappingFixed++;
      }
    }
  }
  fs.writeFileSync(mappingPath, JSON.stringify(mapping, null, 2), 'utf8');
  console.log(`Fixed ${mappingFixed} entries in bytescale_mapping_cleaned.json`);
}

console.log('\n=== SUMMARY ===');
console.log(`Total Desconhecido in state: ${Object.values(state.exam_details).filter(d => d.patient_name === 'Desconhecido').length}`);
console.log(`Fixable (have real name): ${fixes.length}`);
console.log(`Already fixed or unfixable: ${remainingDesc.length}`);
