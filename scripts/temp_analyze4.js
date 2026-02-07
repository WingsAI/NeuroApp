const state = require('./eyercloud_downloader/download_state.json');

// Check if exam_details have image_list with type info
let withImageList = 0;
let withoutImageList = 0;
let totalImagesInState = 0;
const typeCountsState = {};

for (const [examId, details] of Object.entries(state.exam_details)) {
  if (details.image_list && details.image_list.length > 0) {
    withImageList++;
    for (const img of details.image_list) {
      totalImagesInState++;
      const t = img.type || 'NO_TYPE';
      typeCountsState[t] = (typeCountsState[t] || 0) + 1;
    }
  } else {
    withoutImageList++;
  }
}

console.log('=== IMAGE LIST IN STATE ===');
console.log(`Exams with image_list: ${withImageList}`);
console.log(`Exams WITHOUT image_list: ${withoutImageList}`);
console.log(`Total images in state: ${totalImagesInState}`);
console.log('\nType distribution in state:');
for (const [type, count] of Object.entries(typeCountsState).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${type}: ${count}`);
}

// Sample image_list entry
if (withImageList > 0) {
  const sampleExam = Object.entries(state.exam_details).find(([id, d]) => d.image_list && d.image_list.length > 0);
  console.log('\n=== SAMPLE image_list entry ===');
  console.log('Exam ID:', sampleExam[0]);
  console.log('Patient:', sampleExam[1].patient_name);
  console.log('First image:', JSON.stringify(sampleExam[1].image_list[0], null, 2));

  // Also check if there's a mix of COLOR and ANTERIOR
  const sampleWithColor = Object.entries(state.exam_details).find(([id, d]) =>
    d.image_list && d.image_list.some(i => i.type === 'COLOR')
  );
  if (sampleWithColor) {
    console.log('\n=== SAMPLE with COLOR type ===');
    console.log('Patient:', sampleWithColor[1].patient_name);
    sampleWithColor[1].image_list.forEach(img => {
      console.log(`  ${img.uuid} type=${img.type}`);
    });
  }

  const sampleWithAnterior = Object.entries(state.exam_details).find(([id, d]) =>
    d.image_list && d.image_list.some(i => i.type === 'ANTERIOR')
  );
  if (sampleWithAnterior) {
    console.log('\n=== SAMPLE with ANTERIOR type ===');
    console.log('Patient:', sampleWithAnterior[1].patient_name);
    sampleWithAnterior[1].image_list.forEach(img => {
      console.log(`  ${img.uuid} type=${img.type}`);
    });
  }
}
