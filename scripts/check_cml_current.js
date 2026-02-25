/**
 * Check: of the 28 CML-nullified patients, which ones still have null selectedImages?
 * If the doctor already re-selected, they're fine. If still null, they may need restoration.
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const fs = require('fs');

async function main() {
  // CML-nullified patients from comparison
  const snap1 = JSON.parse(fs.readFileSync('scripts/db_snapshots/snapshot_2026-02-09_2343.json', 'utf8'));
  const reports1 = snap1.data.medicalReports;
  const exams1 = snap1.data.exams;
  const patients1 = snap1.data.patients;

  const patMap = {};
  for (const pat of patients1) patMap[pat.id] = pat;

  // Find exams that had CML selectedImages
  const cmlExams = [];
  for (const exam of exams1) {
    const r = reports1.find(r => r.examId === exam.id);
    if (!r || !r.selectedImages) continue;
    const si = r.selectedImages;
    const hadCml = (si.od && si.od.startsWith('cm')) || (si.oe && si.oe.startsWith('cm'));
    if (hadCml) {
      cmlExams.push({
        examId: exam.id,
        patientId: exam.patientId,
        name: patMap[exam.patientId]?.name || 'UNKNOWN',
        oldSi: si
      });
    }
  }

  console.log(`Found ${cmlExams.length} exams with CML selectedImages in snapshot 09/02\n`);

  let stillNull = 0;
  let fixed = 0;

  for (const ce of cmlExams) {
    // Check current DB state
    const exam = await p.exam.findUnique({
      where: { id: ce.examId },
      include: { report: { select: { selectedImages: true } } }
    });

    if (!exam) {
      // Exam was deleted (e.g., Francisco Elivan duplicate)
      continue;
    }

    const currentSi = exam.report?.selectedImages;
    const odNull = !currentSi?.od;
    const oeNull = !currentSi?.oe;

    if (odNull || oeNull) {
      console.log(`STILL NULL: ${ce.name}`);
      console.log(`  Old (09/02): ${JSON.stringify(ce.oldSi)}`);
      console.log(`  Current:     ${JSON.stringify(currentSi)}`);
      console.log();
      stillNull++;
    } else {
      fixed++;
    }
  }

  console.log(`=== SUMMARY ===`);
  console.log(`CML exams checked: ${cmlExams.length}`);
  console.log(`Doctor already fixed: ${fixed}`);
  console.log(`Still null (need attention): ${stillNull}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
