const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');
const state = require('./eyercloud_downloader/download_state.json');

const mappingExamIds = new Set();
Object.values(mapping).forEach(entry => {
  if (entry.exam_id) mappingExamIds.add(entry.exam_id);
});

const stateExamIds = Object.keys(state.exam_details);

console.log('Bytescale mapping v2:', mappingExamIds.size, 'unique exam_ids');
console.log('Download state:', stateExamIds.length, 'exams');
console.log('');

// Check if APARECIDO is in mapping
const aparecidoInMapping = Object.values(mapping).find(e => e.exam_id === '69809d9f51ffa0242a2cdddb');
console.log('APARECIDO in mapping:', !!aparecidoInMapping);
if (aparecidoInMapping) {
  console.log('  images:', aparecidoInMapping.images?.length || 0);
  console.log('  patient_name:', aparecidoInMapping.patient_name);
}

// Check Djalma exams
const djalmaExam1 = Object.values(mapping).find(e => e.exam_id === '6983859f6c3332846945148c');
const djalmaExam2 = Object.values(mapping).find(e => e.exam_id === '698386be6c333284694515cb');
console.log('');
console.log('Djalma exam 1 (6983859f6c3332846945148c) in mapping:', !!djalmaExam1);
if (djalmaExam1) console.log('  images:', djalmaExam1.images?.length || 0);
console.log('Djalma exam 2 (698386be6c333284694515cb) in mapping:', !!djalmaExam2);
if (djalmaExam2) console.log('  images:', djalmaExam2.images?.length || 0);

// Check Ivan
const ivanInMapping = Object.values(mapping).find(e => e.exam_id === '6980eb661fa8062e17d3e4cb');
console.log('');
console.log('Ivan (6980eb661fa8062e17d3e4cb) in mapping:', !!ivanInMapping);
if (ivanInMapping) {
  console.log('  images:', ivanInMapping.images?.length || 0);
  console.log('  patient_name:', ivanInMapping.patient_name);
}

// Check Helena
const helenaInMapping = Object.values(mapping).find(e => e.exam_id === '69809d871fa8062e17d3adba');
console.log('');
console.log('Helena (69809d871fa8062e17d3adba) in mapping:', !!helenaInMapping);
if (helenaInMapping) {
  console.log('  images:', helenaInMapping.images?.length || 0);
  console.log('  patient_name:', helenaInMapping.patient_name);
}

// Count how many exams in state are NOT in mapping
console.log('');
console.log('=== Missing in mapping ===');
let missingCount = 0;
stateExamIds.forEach(examId => {
  if (!mappingExamIds.has(examId)) {
    missingCount++;
    const examData = state.exam_details[examId];
    if (missingCount <= 10) {
      console.log(`${examData.patient_name} - ${examId}`);
    }
  }
});
console.log(`Total exams in state but NOT in mapping: ${missingCount}`);
