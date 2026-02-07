const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');

// Count image types in mapping
const typeCounts = {};
const entriesWithType = [];
const entriesWithoutType = [];

for (const [key, entry] of Object.entries(mapping)) {
  for (const img of (entry.images || [])) {
    const t = img.type || 'NO_TYPE';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  const hasType = entry.images?.some(i => i.type);
  if (hasType) entriesWithType.push(key);
  else entriesWithoutType.push(key);
}

console.log('=== IMAGE TYPES IN MAPPING ===');
for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

console.log(`\nEntries with at least one typed image: ${entriesWithType.length}`);
console.log(`Entries with NO typed images: ${entriesWithoutType.length}`);

// Sample entry with type info
const sampleWithType = Object.entries(mapping).find(([k, v]) => v.images?.some(i => i.type));
if (sampleWithType) {
  console.log('\n=== SAMPLE ENTRY WITH TYPE ===');
  console.log('Key:', sampleWithType[0]);
  console.log('Patient:', sampleWithType[1].patient_name);
  sampleWithType[1].images.slice(0, 5).forEach(img => {
    console.log(`  ${img.filename} type=${img.type}`);
  });
}

// Check if the EyerCloud downloader creates type info
// Let's check what types exist per patient
console.log('\n=== TYPE DISTRIBUTION PER PATIENT (sample) ===');
let count = 0;
for (const [key, entry] of Object.entries(mapping)) {
  if (count >= 5) break;
  const types = {};
  for (const img of (entry.images || [])) {
    const t = img.type || 'NO_TYPE';
    types[t] = (types[t] || 0) + 1;
  }
  if (Object.keys(types).length > 1) {
    console.log(`${entry.patient_name}: ${JSON.stringify(types)}`);
    count++;
  }
}

// Now check the Python downloader to see if it assigns types
const fs = require('fs');
const path = require('path');
const downloaderDir = path.join(__dirname, 'eyercloud_downloader');
const files = fs.readdirSync(downloaderDir).filter(f => f.endsWith('.py'));
console.log('\n=== Python downloader files ===');
files.forEach(f => console.log('  ' + f));
