const fs = require('fs');
const s = JSON.parse(fs.readFileSync('E:/GitHub/NeuroApp/scripts/db_snapshots/snapshot_2026-02-09_1626.json', 'utf-8'));

// Check structure
console.log('Snapshot keys:', Object.keys(s));

// Find patient
const patients = s.Patient || s.patients || s.patient || [];
console.log('Patients count:', patients.length);

const p = patients.find(x => x.name && x.name.toUpperCase().includes('FRANCISCO SERGIO'));
if (p) {
  console.log('\nPatient:', p.name, '(ID:', p.id, ')');
  console.log('CPF:', p.cpf);

  // Find exams
  const exams = s.Exam || s.exams || s.exam || [];
  const pExams = exams.filter(e => e.patientId === p.id);
  console.log('\nExams:', pExams.length);
  for (const e of pExams) {
    console.log('  ', e.id, 'status:', e.status, 'eyerCloud:', e.eyerCloudId);
  }

  // Find images
  const images = s.ExamImage || s.images || s.examImage || [];
  for (const e of pExams) {
    const eImgs = images.filter(i => i.examId === e.id);
    console.log('\nImages for exam', e.id, ':', eImgs.length);
    eImgs.sort((a, b) => a.id.localeCompare(b.id));
    eImgs.forEach((img, i) => console.log('  [' + i + ']', img.id, '(' + (img.type || '?') + ')'));
  }

  // Find reports
  const reports = s.MedicalReport || s.reports || s.medicalReport || [];
  for (const e of pExams) {
    const eReports = reports.filter(r => r.examId === e.id);
    console.log('\nReports for exam', e.id, ':', eReports.length);
    for (const r of eReports) {
      console.log('  selectedImages:', JSON.stringify(r.selectedImages));
      console.log('  completedAt:', r.completedAt);
    }
  }
} else {
  console.log('NOT FOUND');
  // Show all names that include FRANCISCO
  const franciscos = patients.filter(p => p.name && p.name.toUpperCase().includes('FRANCISCO'));
  console.log('\nAll FRANCISCO patients:', franciscos.length);
  franciscos.forEach(p => console.log('  ', p.name));
}
