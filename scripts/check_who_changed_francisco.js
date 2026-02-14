/**
 * Check if any of our fix scripts touched FRANCISCO SERGIO's selectedImages.
 *
 * His exam ID is 697001ce4e429636ed944c10
 * His report currently has: {"od":"examId-6","oe":"examId-5"}
 *
 * The doctor says he selected COLOR for OD, but examId-6 is ANTERIOR.
 * So either:
 * 1. Our scripts overwrote his selectedImages
 * 2. The medical page showed images in a different order than expected
 * 3. Something else
 *
 * Let's check the DB snapshot from 2026-02-09 to see what selectedImages was before our fixes.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  // Load the snapshot
  const snapshotPath = path.join(__dirname, 'db_snapshots', 'snapshot_2026-02-09_1626.json');
  if (!fs.existsSync(snapshotPath)) {
    console.log('Snapshot not found!');
    return;
  }

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));

  // Find Francisco Sergio in snapshot
  console.log('=== SNAPSHOT (2026-02-09) ===\n');

  // Check patients
  const patient = snapshot.patients?.find(p => p.name && p.name.toUpperCase().includes('FRANCISCO SERGIO'));
  if (patient) {
    console.log(`Patient: ${patient.name} (ID: ${patient.id})`);
    console.log(`CPF: ${patient.cpf}`);
  } else {
    console.log('Patient not found in snapshot');
  }

  // Check exams
  const exams = snapshot.exams?.filter(e => e.patientId === patient?.id || e.id === '697001ce4e429636ed944c10') || [];
  console.log(`\nExams (${exams.length}):`);
  for (const exam of exams) {
    console.log(`  ${exam.id} (eyerCloud: ${exam.eyerCloudId}, status: ${exam.status})`);
  }

  // Check images for this exam
  const images = snapshot.images?.filter(i =>
    exams.some(e => e.id === i.examId)
  ) || [];
  console.log(`\nImages (${images.length}):`);
  images.sort((a, b) => a.id.localeCompare(b.id));
  images.forEach((img, i) => {
    console.log(`  [${i}] ${img.id} (${img.type}) - ${img.fileName || '?'}`);
  });

  // Check reports
  const reports = snapshot.reports?.filter(r =>
    exams.some(e => e.id === r.examId)
  ) || [];
  console.log(`\nReports (${reports.length}):`);
  for (const report of reports) {
    console.log(`  examId: ${report.examId}`);
    console.log(`  selectedImages: ${JSON.stringify(report.selectedImages)}`);
    console.log(`  doctorName: ${report.doctorName}`);
    console.log(`  completedAt: ${report.completedAt}`);
  }

  // Compare with current state
  console.log('\n=== COMPARISON ===');
  console.log('Snapshot selectedImages:', reports[0]?.selectedImages ? JSON.stringify(reports[0].selectedImages) : 'NO REPORT');
  console.log('Current selectedImages:  {"od":"697001ce4e429636ed944c10-6","oe":"697001ce4e429636ed944c10-5"}');

  // Check if this patient was in the 48 missing group
  console.log('\n=== CHECK: Was he in the 48 missing group? ===');
  const missing47Path = path.join(__dirname, 'missing_47_patients.json');
  if (fs.existsSync(missing47Path)) {
    const missing = JSON.parse(fs.readFileSync(missing47Path, 'utf-8'));
    const found = missing.find(m => m.name && m.name.toUpperCase().includes('FRANCISCO SERGIO'));
    if (found) {
      console.log(`YES - Found in missing_47: ${JSON.stringify(found)}`);
    } else {
      console.log('NO - Not in missing_47_patients.json');
    }
  }

  // Check if the snapshot had different image IDs (old format vs new)
  if (images.length > 0) {
    console.log('\n=== IMAGE ID FORMAT IN SNAPSHOT ===');
    const oldFormat = images.filter(i => i.id.match(/^[a-f0-9]{24}-\d+$/));
    const newFormat = images.filter(i => i.id.startsWith('img-'));
    console.log(`Old format (examId-N): ${oldFormat.length}`);
    console.log(`New format (img-UUID): ${newFormat.length}`);
  }
}

main().catch(e => console.error(e));
