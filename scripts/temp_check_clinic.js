const state = require('./eyercloud_downloader/download_state.json');

const examsWithId = [];
const examsWithName = {};

for (const [examId, data] of Object.entries(state.exam_details)) {
  if (data.clinic_name === '695e434f28b781ee6000d862') {
    examsWithId.push(data.exam_date);
  } else if (data.clinic_name && data.clinic_name !== 'Campos do Jordão-SP' && data.clinic_name !== 'Tauá-CE') {
    if (!examsWithName[data.clinic_name]) examsWithName[data.clinic_name] = [];
    examsWithName[data.clinic_name].push(data.exam_date);
  }
}

console.log('Exames com ID como clinic_name:', examsWithId.length);
console.log('Primeira data:', examsWithId.sort()[0]);
console.log('Última data:', examsWithId.sort()[examsWithId.length - 1]);

console.log('\nOutras clinics:');
for (const [name, dates] of Object.entries(examsWithName)) {
  console.log(name + ':', dates.length, 'exames');
  console.log('  Primeira:', dates.sort()[0]);
  console.log('  Última:', dates.sort()[dates.length - 1]);
}
