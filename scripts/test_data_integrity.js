/**
 * test_data_integrity.js - Testa a integridade dos dados no banco
 * ================================================================
 *
 * Verifica:
 * 1. Nenhum paciente com ID curto (8 hex chars)
 * 2. Nenhum exame com ID curto
 * 3. Todos os exames tem paciente
 * 4. Todos os reports tem exame valido
 * 5. Image types são apenas COLOR ou ANTERIOR
 * 6. Nenhum exam tem imagens REDFREE
 * 7. Nenhum exame duplicado por exam_id
 * 8. Nenhum paciente duplicado por nome normalizado
 * 9. Reports não ficaram órfãos
 * 10. Contagem geral do banco
 *
 * Uso:
 *   node scripts/test_data_integrity.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeName(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let passed = 0;
let failed = 0;
let warnings = 0;

function test(name, ok, detail) {
  if (ok) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    if (detail) console.log(`        ${detail}`);
    failed++;
  }
}

function warn(name, detail) {
  console.log(`  WARN: ${name}`);
  if (detail) console.log(`        ${detail}`);
  warnings++;
}

async function main() {
  console.log('='.repeat(60));
  console.log('DATA INTEGRITY TESTS');
  console.log('='.repeat(60));

  // Load all data
  const patients = await prisma.patient.findMany();
  const exams = await prisma.exam.findMany({ include: { patient: true, images: true, report: true } });
  const images = await prisma.examImage.findMany();
  const reports = await prisma.medicalReport.findMany();

  console.log(`\nDB: ${patients.length} patients, ${exams.length} exams, ${images.length} images, ${reports.length} reports\n`);

  // === TEST 1: No short-ID patients ===
  console.log('--- ID Integrity ---');
  const shortIdPatients = patients.filter(p => /^[a-f0-9]{8}$/.test(p.id));
  test('No short-ID patients (8 hex chars)', shortIdPatients.length === 0,
    shortIdPatients.length > 0 ? `Found ${shortIdPatients.length}: ${shortIdPatients.map(p => `${p.name} (${p.id})`).join(', ')}` : null);

  // === TEST 2: No short-ID exams ===
  const shortIdExams = exams.filter(e => /^[a-f0-9]{8}$/.test(e.id));
  test('No short-ID exams (8 hex chars)', shortIdExams.length === 0,
    shortIdExams.length > 0 ? `Found ${shortIdExams.length}: ${shortIdExams.map(e => `${e.patient.name} (${e.id})`).join(', ')}` : null);

  // === TEST 3: All patient IDs are valid format ===
  const validPatientIds = patients.filter(p =>
    /^[a-f0-9]{24}$/.test(p.id) || p.id.startsWith('manual-') || p.id.startsWith('cml')
  );
  test('All patient IDs have valid format (24hex / manual-* / cml*)',
    validPatientIds.length === patients.length,
    `${patients.length - validPatientIds.length} invalid IDs`);

  // === TEST 4: All exams have a patient ===
  console.log('\n--- Referential Integrity ---');
  const orphanExams = exams.filter(e => !e.patient);
  test('All exams have a valid patient', orphanExams.length === 0,
    orphanExams.length > 0 ? `${orphanExams.length} orphan exams` : null);

  // === TEST 5: All reports have a valid exam ===
  const examIds = new Set(exams.map(e => e.id));
  const orphanReports = reports.filter(r => !examIds.has(r.examId));
  test('All reports have a valid exam', orphanReports.length === 0,
    orphanReports.length > 0 ? `${orphanReports.length} orphan reports` : null);

  // === TEST 6: All images have a valid exam ===
  const orphanImages = images.filter(i => !examIds.has(i.examId));
  test('All images have a valid exam', orphanImages.length === 0,
    orphanImages.length > 0 ? `${orphanImages.length} orphan images` : null);

  // === TEST 7: Image types are only COLOR or ANTERIOR ===
  console.log('\n--- Image Types ---');
  const typeCounts = {};
  images.forEach(i => { typeCounts[i.type || 'NULL'] = (typeCounts[i.type || 'NULL'] || 0) + 1; });
  const badTypes = images.filter(i => i.type !== 'COLOR' && i.type !== 'ANTERIOR');
  test('All images are COLOR or ANTERIOR', badTypes.length === 0,
    badTypes.length > 0 ? `Found: ${JSON.stringify(typeCounts)}` : `COLOR: ${typeCounts['COLOR'] || 0}, ANTERIOR: ${typeCounts['ANTERIOR'] || 0}`);

  // === TEST 8: No REDFREE images ===
  const redfreeImages = images.filter(i => i.type === 'REDFREE');
  test('No REDFREE images in DB', redfreeImages.length === 0,
    redfreeImages.length > 0 ? `Found ${redfreeImages.length} REDFREE images` : null);

  // === TEST 9: No duplicate exams (same eyerCloudId), excluding CML exams ===
  // CML exams legitimately share eyerCloudId with the EyerCloud exam they were created from
  console.log('\n--- Duplicates ---');
  const nonCmlExams = exams.filter(e => !e.id.startsWith('cml'));
  const eyerCloudIds = nonCmlExams.filter(e => e.eyerCloudId).map(e => e.eyerCloudId);
  const dupeEyerIds = eyerCloudIds.filter((id, i) => eyerCloudIds.indexOf(id) !== i);
  test('No duplicate eyerCloudId among EyerCloud exams (excl. CML)', dupeEyerIds.length === 0,
    dupeEyerIds.length > 0 ? `${dupeEyerIds.length} duplicates: ${[...new Set(dupeEyerIds)].slice(0, 5).join(', ')}` : null);

  // === TEST 9b: All EyerCloud exams have eyerCloudId === id ===
  const eyerExamsMismatch = nonCmlExams.filter(e => /^[a-f0-9]{24}$/.test(e.id) && e.eyerCloudId !== e.id);
  test('All EyerCloud exams have eyerCloudId === id', eyerExamsMismatch.length === 0,
    eyerExamsMismatch.length > 0 ? `${eyerExamsMismatch.length} mismatched` : null);

  // === TEST 10: No duplicate patients by normalized name ===
  const nameMap = {};
  for (const p of patients) {
    const norm = normalizeName(p.name);
    if (!nameMap[norm]) nameMap[norm] = [];
    nameMap[norm].push(p);
  }
  const dupeNames = Object.entries(nameMap).filter(([_, ps]) => ps.length > 1);
  if (dupeNames.length > 0) {
    // Check if they're truly duplicates (same person) vs different people with same name
    const trueDupes = dupeNames.filter(([_, ps]) => {
      // If all have the same birthDate, they're duplicates
      const births = ps.map(p => p.birthDate ? p.birthDate.toISOString().split('T')[0] : 'unknown');
      return new Set(births).size === 1;
    });
    if (trueDupes.length > 0) {
      test('No duplicate patients by normalized name', false,
        `${trueDupes.length} duplicates: ${trueDupes.slice(0, 5).map(([n, ps]) => `${n} (${ps.length}x)`).join(', ')}`);
    } else {
      warn(`${dupeNames.length} patients share names but have different birthDates`,
        dupeNames.slice(0, 3).map(([n, ps]) => `${n}: ${ps.map(p => p.id.substring(0, 12)).join(', ')}`).join('; '));
      test('No duplicate patients by normalized name + birthDate', true);
    }
  } else {
    test('No duplicate patients by normalized name', true);
  }

  // === TEST 11: All exams with reports are not "pending" ===
  console.log('\n--- Business Rules ---');
  const examsWithReports = exams.filter(e => e.report);
  const pendingWithReport = examsWithReports.filter(e => e.status === 'pending');
  if (pendingWithReport.length > 0) {
    warn(`${pendingWithReport.length} exams have reports but status is still "pending"`,
      pendingWithReport.slice(0, 3).map(e => `${e.patient.name} (${e.id.substring(0, 12)})`).join(', '));
  }

  // === TEST 12: No exams with 0 images (except manual/cml) ===
  const emptyExams = exams.filter(e => e.images.length === 0 && !e.id.startsWith('cml'));
  if (emptyExams.length > 0) {
    warn(`${emptyExams.length} EyerCloud exams have 0 images`,
      emptyExams.slice(0, 5).map(e => `${e.patient.name} (${e.id.substring(0, 12)})`).join(', '));
  }

  // === TEST 13: Image URLs are valid ===
  console.log('\n--- Image URLs ---');
  const bytescaleImages = images.filter(i => i.url && i.url.includes('upcdn.io'));
  const s3Images = images.filter(i => i.url && (i.url.includes('amazonaws.com') || i.url.includes('s3.')));
  const otherImages = images.filter(i => i.url && !i.url.includes('upcdn.io') && !i.url.includes('amazonaws.com') && !i.url.includes('s3.'));
  const noUrlImages = images.filter(i => !i.url);
  test('All images have URLs', noUrlImages.length === 0,
    noUrlImages.length > 0 ? `${noUrlImages.length} images without URL` : null);
  console.log(`        Bytescale: ${bytescaleImages.length}, S3: ${s3Images.length}, Other: ${otherImages.length}`);

  // === SUMMARY ===
  console.log('\n' + '='.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  console.log('='.repeat(60));

  if (failed > 0) {
    console.log('\nFAILED TESTS NEED ATTENTION!');
    process.exitCode = 1;
  } else if (warnings > 0) {
    console.log('\nAll tests passed. Some warnings to review.');
  } else {
    console.log('\nAll tests passed!');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
