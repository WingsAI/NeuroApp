const state = require('./eyercloud_downloader/download_state.json');
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');

console.log('=== EyerCloud download_state.json ===\n');

const examEntries = Object.entries(state.exam_details || {}).map(([id, data]) => ({ exam_id: id, ...data }));

// Case 1: APARECIDO ROBERTO LOCAISE
const aparecido = examEntries.find(e => e.patient_name?.toUpperCase().includes('APARECIDO ROBERTO LOCAISE'));
console.log('Case 1 - APARECIDO ROBERTO LOCAISE:');
if (aparecido) {
  console.log('  exam_id:', aparecido.exam_id);
  console.log('  expected_images:', aparecido.expected_images);
  console.log('  has image_details:', !!aparecido.image_details);
  if (aparecido.image_details) {
    const types = aparecido.image_details.reduce((acc, img) => {
      acc[img.type] = (acc[img.type] || 0) + 1;
      return acc;
    }, {});
    console.log('  image types:', types);
  }
  // Check mapping
  const mappingEntry = Object.entries(mapping).find(([key, val]) => val.exam_id === aparecido.exam_id);
  if (mappingEntry) {
    console.log('  bytescale mapping found, images uploaded:', mappingEntry[1].images?.length || 0);
  } else {
    console.log('  NO bytescale mapping - images not uploaded!');
  }
} else {
  console.log('  NOT FOUND in download_state');
}

// Case 2: Djalma
const djalma = examEntries.filter(e => e.patient_name?.toUpperCase().includes('DJALMA'));
console.log('\nCase 2 - Djalma:');
console.log('  Found', djalma.length, 'exams');
djalma.forEach(e => {
  console.log('  exam_id:', e.exam_id, 'date:', e.exam_date, 'expected_images:', e.expected_images);
  if (e.image_details) {
    const types = e.image_details.reduce((acc, img) => {
      acc[img.type] = (acc[img.type] || 0) + 1;
      return acc;
    }, {});
    console.log('    image types:', types);
  }
  const mappingEntry = Object.entries(mapping).find(([key, val]) => val.exam_id === e.exam_id);
  if (mappingEntry) {
    console.log('    bytescale mapping found, images uploaded:', mappingEntry[1].images?.length || 0);
  } else {
    console.log('    NO bytescale mapping - images not uploaded!');
  }
});

// Case 3: Ivan Lucio
const ivan = examEntries.filter(e => e.patient_name?.toUpperCase().includes('IVAN LUCIO'));
console.log('\nCase 3 - Ivan Lucio:');
console.log('  Found', ivan.length, 'exams');
ivan.forEach(e => {
  console.log('  exam_id:', e.exam_id, 'patient_name:', e.patient_name);
  console.log('  birth_date:', e.patient_birth_date);
});

// Case 4: Helena
const helena = examEntries.filter(e => e.patient_name?.toUpperCase().includes('HELENA MARIA'));
console.log('\nCase 4 - Helena Maria:');
console.log('  Found', helena.length, 'exams');
helena.forEach(e => {
  console.log('  exam_id:', e.exam_id, 'date:', e.exam_date, 'expected_images:', e.expected_images);
  if (e.image_details) {
    const types = e.image_details.reduce((acc, img) => {
      acc[img.type] = (acc[img.type] || 0) + 1;
      return acc;
    }, {});
    console.log('    image types:', types);
  }
  const mappingEntry = Object.entries(mapping).find(([key, val]) => val.exam_id === e.exam_id);
  if (mappingEntry) {
    console.log('    bytescale mapping found, images uploaded:', mappingEntry[1].images?.length || 0);
  } else {
    console.log('    NO bytescale mapping - images not uploaded!');
  }
});
