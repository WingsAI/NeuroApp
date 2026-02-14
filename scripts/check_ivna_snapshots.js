const fs = require('fs');
const snapshots = fs.readdirSync('scripts/db_snapshots').filter(f => f.endsWith('.json'));
for (const snap of snapshots) {
  const s = JSON.parse(fs.readFileSync('scripts/db_snapshots/' + snap, 'utf8'));
  const data = s.data || s;
  const reports = data.medicalReports || data.MedicalReport || [];
  const exams = data.exams || data.Exam || [];
  const ivnaExam = exams.find(e => e.id === '697001c9029f1e6981546a85');
  if (!ivnaExam) { console.log(snap + ': exam not found'); continue; }
  const report = reports.find(r => r.examId === '697001c9029f1e6981546a85');
  console.log(snap + ':', JSON.stringify(report?.selectedImages));
}
