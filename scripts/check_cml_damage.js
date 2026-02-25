/**
 * Compare selectedImages between snapshot_2026-02-09 and snapshot_2026-02-14
 * to find patients whose selectedImages were changed by fix_cml_selected_images.js
 */
const fs = require('fs');

const snap1 = JSON.parse(fs.readFileSync('scripts/db_snapshots/snapshot_2026-02-09_2343.json', 'utf8'));
const snap2 = JSON.parse(fs.readFileSync('scripts/db_snapshots/snapshot_2026-02-14_1801.json', 'utf8'));

const reports1 = snap1.data.medicalReports;
const reports2 = snap2.data.medicalReports;
const exams1 = snap1.data.exams;
const patients1 = snap1.data.patients;
const patients2 = snap2.data.patients;

// Build maps
const reportMap1 = {};
for (const r of reports1) reportMap1[r.examId] = r;
const reportMap2 = {};
for (const r of reports2) reportMap2[r.examId] = r;

const patientMap1 = {};
for (const p of patients1) patientMap1[p.id] = p;
const patientMap2 = {};
for (const p of patients2) patientMap2[p.id] = p;

const examMap1 = {};
for (const e of exams1) examMap1[e.id] = e;

console.log('=== Comparing selectedImages: snapshot 09/02 vs 14/02 ===\n');

let changed = 0;
let nullified = 0;

for (const exam of exams1) {
  const r1 = reportMap1[exam.id];
  const r2 = reportMap2[exam.id];
  if (!r1 || !r2) continue;

  const si1 = r1.selectedImages;
  const si2 = r2.selectedImages;
  if (!si1) continue;

  const s1 = JSON.stringify(si1);
  const s2 = JSON.stringify(si2);

  if (s1 !== s2) {
    const patient = patientMap1[exam.patientId] || patientMap2[exam.patientId];
    const name = patient?.name || 'UNKNOWN';

    // Check if it was CML IDs that got nullified
    const hadCml = (si1.od && si1.od.startsWith('cm')) || (si1.oe && si1.oe.startsWith('cm'));
    const nowNull = (si2.od === null && si1.od !== null) || (si2.oe === null && si1.oe !== null);

    const flag = hadCml ? ' [CML->NULL]' : nowNull ? ' [NULLIFIED]' : ' [CHANGED]';

    console.log(`${name}${flag}`);
    console.log(`  09/02: ${s1}`);
    console.log(`  14/02: ${s2}`);
    console.log();

    changed++;
    if (hadCml && nowNull) nullified++;
  }
}

console.log(`=== SUMMARY ===`);
console.log(`Total changed: ${changed}`);
console.log(`CML nullified: ${nullified}`);
