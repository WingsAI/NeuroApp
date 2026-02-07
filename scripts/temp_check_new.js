const s = require('./eyercloud_downloader/download_state.json');
const m = require('./missing_47_patients.json');
const stateIds = new Set(Object.keys(s.exam_details));

const trulyNew = m.patients.filter(p => !stateIds.has(p.examId));
console.log('Truly new (need download):', trulyNew.length);
trulyNew.forEach(p => console.log('  ' + p.name + ' | ' + p.examId));

const alreadyDownloaded = m.patients.filter(p => stateIds.has(p.examId));
console.log('\nAlready downloaded as Desconhecido:', alreadyDownloaded.length);

console.log('\nMath check:');
console.log('  State exams:', 433);
console.log('  Truly new:', trulyNew.length);
console.log('  Total:', 433 + trulyNew.length);
console.log('  Target: 456, Diff:', 456 - 433 - trulyNew.length);
