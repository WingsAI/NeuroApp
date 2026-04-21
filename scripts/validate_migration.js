/**
 * Phase 3.5 — validate migrated data shape against the app's expectations.
 *
 * Simulates the reads that getPatientsAction / results / medical pages do,
 * and asserts the invariants matter to the UI:
 *   - every exam has location (required)
 *   - every exam has a technicianName (required — empty string is OK)
 *   - every image has url + fileName
 *   - no duplicate image ids
 *   - counts per location look sensible
 *   - 39 staging-origin zero-image exams are still zero-image in main (expected)
 *   - spot-check 3 migrated patients: Melina, Mozania, collision
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function pct(n, d) { return d === 0 ? '-' : ((n / d) * 100).toFixed(1) + '%'; }

async function main() {
  console.log('=== Phase 3.5 — migration validation ===\n');

  const [patients, exams, images] = await Promise.all([
    prisma.patient.findMany({ select: { id: true, name: true, gender: true, cpf: true, birthDate: true } }),
    prisma.exam.findMany({ select: { id: true, location: true, technicianName: true, status: true, patientId: true, eyerCloudId: true } }),
    prisma.examImage.findMany({ select: { id: true, url: true, fileName: true, type: true, examId: true } }),
  ]);
  console.log(`Totals — patients: ${patients.length}  exams: ${exams.length}  images: ${images.length}\n`);

  let badLocation = 0, badTechnician = 0, badUrl = 0, badFilename = 0, badType = 0;
  for (const e of exams) {
    if (!e.location || e.location.trim() === '') badLocation++;
    if (e.technicianName === null || e.technicianName === undefined) badTechnician++;
  }
  const imgIds = new Set();
  let dupImgIds = 0;
  for (const i of images) {
    if (!i.url) badUrl++;
    if (!i.fileName) badFilename++;
    if (!i.type) badType++;
    if (imgIds.has(i.id)) dupImgIds++;
    imgIds.add(i.id);
  }
  console.log('Invariants (all should be 0):');
  console.log(`   exams with null/empty location:     ${badLocation}`);
  console.log(`   exams with null technicianName:     ${badTechnician}`);
  console.log(`   images with no URL:                 ${badUrl}`);
  console.log(`   images with no fileName:            ${badFilename}`);
  console.log(`   images with no type:                ${badType}`);
  console.log(`   duplicate image ids:                ${dupImgIds}\n`);

  const byLocation = {};
  for (const e of exams) byLocation[e.location] = (byLocation[e.location] || 0) + 1;
  console.log('Exams per location:');
  Object.entries(byLocation).sort((a, b) => b[1] - a[1]).forEach(([loc, n]) => {
    console.log(`   ${loc.padEnd(40)} ${n}`);
  });

  const imgsByExam = new Map();
  for (const i of images) imgsByExam.set(i.examId, (imgsByExam.get(i.examId) || 0) + 1);
  const zeroImg = exams.filter((e) => !imgsByExam.has(e.id));
  const zeroByLocation = {};
  for (const e of zeroImg) zeroByLocation[e.location] = (zeroByLocation[e.location] || 0) + 1;
  console.log(`\nZero-image exams: ${zeroImg.length}`);
  Object.entries(zeroByLocation).sort((a, b) => b[1] - a[1]).forEach(([loc, n]) => {
    console.log(`   ${loc.padEnd(40)} ${n}`);
  });

  const genderCounts = {};
  for (const p of patients) {
    const g = p.gender ?? 'NULL';
    genderCounts[g] = (genderCounts[g] || 0) + 1;
  }
  console.log(`\nGender distribution: ${JSON.stringify(genderCounts)}`);
  if (genderCounts.male || genderCounts.female) {
    console.log(`   WARN: non-normalized gender values present.`);
  }

  const missingBirth = patients.filter((p) => !p.birthDate).length;
  const missingCpf = patients.filter((p) => !p.cpf).length;
  console.log(`\nPatients missing birthDate: ${missingBirth} (${pct(missingBirth, patients.length)})`);
  console.log(`Patients missing CPF:       ${missingCpf} (${pct(missingCpf, patients.length)})`);

  // Cross-check FK integrity
  const patientIds = new Set(patients.map((p) => p.id));
  const examIds = new Set(exams.map((e) => e.id));
  const orphanExams = exams.filter((e) => !patientIds.has(e.patientId)).length;
  const orphanImages = images.filter((i) => !examIds.has(i.examId)).length;
  console.log(`\nFK integrity — exams with orphan patientId: ${orphanExams}`);
  console.log(`FK integrity — images with orphan examId:   ${orphanImages}`);

  // Spot-check 3 patients
  console.log('\n=== Spot-check ===');
  const pick = async (filter, label) => {
    const p = await prisma.patient.findFirst({
      where: filter,
      include: { exams: { include: { images: { select: { id: true, type: true } } } } },
    });
    if (!p) return console.log(`   ${label}: none found`);
    const totalImgs = p.exams.reduce((n, e) => n + e.images.length, 0);
    console.log(`   ${label}: ${p.name} | ${p.exams.length} exams | ${totalImgs} images | gender=${p.gender} | birth=${p.birthDate?.toISOString?.().slice(0, 10) || null}`);
    p.exams.slice(0, 2).forEach((e) => {
      const types = {};
      e.images.forEach((i) => { types[i.type || 'NULL'] = (types[i.type || 'NULL'] || 0) + 1; });
      console.log(`      exam ${e.id} | ${e.location} | imgs=${e.images.length} (${JSON.stringify(types)})`);
    });
  };
  await pick({ exams: { some: { location: 'PD Campos do Jordão' } } }, 'Melina sample');
  await pick({ exams: { some: { location: 'PD São Paulo' } } }, 'Mozania sample');
  await pick({ exams: { some: { location: 'Jaci-SP' } } }, 'Jaci sample (pre-existing)');

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
