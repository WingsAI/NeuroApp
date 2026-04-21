/**
 * Careful bug-hunt across 3 cohorts. READ-ONLY. No mutations.
 *
 * Cohorts:
 *   1. JACI   — main DB exams with location "Jaci-SP"
 *   2. MELINA — main DB "PD Campos do Jordão" + staging (sourceLogin email dramelinalannes)
 *   3. MOZANIA — main DB "PD São Paulo"         + staging (sourceLogin email mozaniareis)
 *
 * Checks per cohort:
 *   - Exams with 0 images
 *   - Exams with images but no report (pending)
 *   - Exams with report but suspicious (selectedImages empty / od|oe missing)
 *   - Duplicate exams per patient (same day)
 *   - examDate vs eyerCloudId timestamp diff (>60 days)
 *   - Location values: is it plausible for the cohort's date range?
 *   - Image-count outliers (exams with 1–3 images may indicate incomplete import)
 *   - Patients appearing in more than one cohort
 *
 * Output is a printed report; no DB writes.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let stagingPrisma = null;
try {
  const { PrismaClient: StagingClient } = require('.prisma/client-staging');
  stagingPrisma = new StagingClient();
} catch (e) {
  console.log('(staging client not available — skipping staging checks)');
}

function isHex24(s) { return typeof s === 'string' && /^[0-9a-f]{24}$/i.test(s); }
function objectIdTimestamp(id) {
  if (!isHex24(id)) return null;
  return new Date(parseInt(id.slice(0, 8), 16) * 1000);
}
function daysDiff(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 86400000;
}
function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }
function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

const COHORTS = [
  {
    name: 'JACI',
    mainLocationPattern: /Jaci/i,
    stagingEmail: null, // not in staging
    expectedDateRange: { start: '2026-01-27', end: '2026-01-30' }, // CLAUDE.md says 27–30/01
    looseDateRange: { start: '2025-12-01', end: '2026-03-31' },
  },
  {
    name: 'MELINA',
    mainLocationPattern: /PD Campos do Jord[ãa]o/i,
    stagingEmail: 'dramelinalannes.endocrino@gmail.com',
    expectedDateRange: { start: '2024-01-01', end: '2026-04-30' },
    looseDateRange: { start: '2023-01-01', end: '2026-12-31' },
  },
  {
    name: 'MOZANIA',
    mainLocationPattern: /PD S[ãa]o Paulo/i,
    stagingEmail: 'mozaniareis@usp.br',
    expectedDateRange: { start: '2022-01-01', end: '2026-04-30' },
    looseDateRange: { start: '2020-01-01', end: '2026-12-31' },
  },
];

async function scanMain(cohort) {
  console.log(`\n================================================================`);
  console.log(`  MAIN DB COHORT: ${cohort.name}  (pattern: ${cohort.mainLocationPattern})`);
  console.log(`================================================================`);

  const exams = await prisma.exam.findMany({
    include: {
      patient: true,
      images: { select: { id: true, type: true, url: true } },
      report: { select: { id: true, selectedImages: true, completedAt: true, doctorName: true } },
      referral: { select: { id: true } },
    },
  });
  const filtered = exams.filter((e) => cohort.mainLocationPattern.test(e.location || ''));
  console.log(`Exams in cohort: ${filtered.length}`);
  if (filtered.length === 0) return [];

  // Per-patient duplicates on same date
  const byPatientDay = new Map();
  for (const e of filtered) {
    const k = `${e.patientId}|${ymd(e.examDate)}`;
    if (!byPatientDay.has(k)) byPatientDay.set(k, []);
    byPatientDay.get(k).push(e);
  }
  const sameDayDups = [...byPatientDay.entries()].filter(([_, arr]) => arr.length > 1);

  const zeroImg = filtered.filter((e) => e.images.length === 0);
  const lowImg  = filtered.filter((e) => e.images.length > 0 && e.images.length < 4);
  const noReport = filtered.filter((e) => !e.report && e.status !== 'pending');
  const pending = filtered.filter((e) => e.status === 'pending');
  const selEmpty = filtered.filter((e) => e.report && (!e.report.selectedImages || (!e.report.selectedImages.od && !e.report.selectedImages.oe)));
  const looseRange = filtered.filter((e) => {
    const d = e.examDate;
    if (!d) return true; // null date is suspicious
    return d < new Date(cohort.looseDateRange.start) || d > new Date(cohort.looseDateRange.end);
  });
  const idTsMismatch = filtered.filter((e) => {
    const idTs = objectIdTimestamp(e.eyerCloudId);
    if (!idTs || !e.examDate) return false;
    return daysDiff(idTs, e.examDate) > 180;
  });
  const hexLocation = filtered.filter((e) => isHex24(e.location));

  console.log(`  Zero-image exams:        ${zeroImg.length}`);
  zeroImg.forEach((e) => console.log(`    - ${e.patient.name} | ${e.id} | ${ymd(e.examDate)} | status=${e.status}`));
  console.log(`  Low-image (<4) exams:    ${lowImg.length}`);
  lowImg.slice(0, 10).forEach((e) => console.log(`    - ${e.patient.name} | ${e.id} | imgs=${e.images.length} | ${ymd(e.examDate)}`));
  if (lowImg.length > 10) console.log(`    ... (${lowImg.length - 10} more)`);
  console.log(`  Pending (unsigned) exams: ${pending.length}`);
  pending.slice(0, 10).forEach((e) => console.log(`    - ${e.patient.name} | ${e.id} | imgs=${e.images.length} | ${ymd(e.examDate)}`));
  if (pending.length > 10) console.log(`    ... (${pending.length - 10} more)`);
  console.log(`  No report & status != pending: ${noReport.length}`);
  console.log(`  Reports with empty selectedImages: ${selEmpty.length}`);
  selEmpty.slice(0, 10).forEach((e) => console.log(`    - ${e.patient.name} | exam ${e.id} | sel=${JSON.stringify(e.report.selectedImages)}`));
  console.log(`  Same-day duplicate exams for same patient: ${sameDayDups.length}`);
  sameDayDups.forEach(([k, arr]) => {
    console.log(`    - ${arr[0].patient.name} on ${ymd(arr[0].examDate)}`);
    arr.forEach((e) => console.log(`        exam ${e.id} | imgs=${e.images.length} | status=${e.status} | report=${!!e.report}`));
  });
  console.log(`  examDate vs eyerCloudId timestamp >180d: ${idTsMismatch.length}`);
  idTsMismatch.slice(0, 10).forEach((e) => {
    const idTs = objectIdTimestamp(e.eyerCloudId);
    console.log(`    - ${e.patient.name} | exam=${ymd(e.examDate)} idTs=${ymd(idTs)} | diff=${Math.round(daysDiff(idTs, e.examDate))}d`);
  });
  console.log(`  examDate outside plausible range: ${looseRange.length}`);
  looseRange.slice(0, 10).forEach((e) => console.log(`    - ${e.patient.name} | ${ymd(e.examDate)} | ${e.id}`));
  console.log(`  Hex location (unresolved clinic id): ${hexLocation.length}`);

  // Report: types distribution (any COLOR:ANTERIOR imbalance?)
  const typeCounts = { COLOR: 0, ANTERIOR: 0, REDFREE: 0, OTHER: 0 };
  for (const e of filtered) for (const i of e.images) {
    if (i.type === 'COLOR') typeCounts.COLOR++;
    else if (i.type === 'ANTERIOR') typeCounts.ANTERIOR++;
    else if (i.type === 'REDFREE') typeCounts.REDFREE++;
    else typeCounts.OTHER++;
  }
  console.log(`  Image types: ${JSON.stringify(typeCounts)}`);
  if (typeCounts.REDFREE > 0) console.log(`    ! REDFREE images found — should have been filtered out`);
  if (typeCounts.OTHER > 0) console.log(`    ! Unknown-type images: ${typeCounts.OTHER}`);

  return filtered;
}

async function scanStaging(cohort) {
  if (!cohort.stagingEmail || !stagingPrisma) return;
  console.log(`\n--- STAGING DB: ${cohort.name}  (email ${cohort.stagingEmail}) ---`);
  const login = await stagingPrisma.sourceLogin.findFirst({ where: { email: cohort.stagingEmail } });
  if (!login) {
    console.log(`  SourceLogin not found`);
    return;
  }
  const patients = await stagingPrisma.stagingPatient.findMany({
    where: { sourceLoginId: login.id },
    include: { exams: { include: { images: { select: { id: true, url: true, type: true } } } } },
  });
  console.log(`  Staging patients: ${patients.length}  exams: ${patients.reduce((n, p) => n + p.exams.length, 0)}`);

  let zeroImg = 0;
  let lowImg = 0;
  let nullDate = 0;
  let badRange = 0;
  const typeCounts = { COLOR: 0, ANTERIOR: 0, REDFREE: 0, OTHER: 0, NULL: 0 };
  const nameDup = new Map();
  for (const p of patients) {
    const n = normalize(p.fullName);
    nameDup.set(n, (nameDup.get(n) || 0) + 1);
    for (const e of p.exams) {
      if (e.images.length === 0) zeroImg++;
      else if (e.images.length < 4) lowImg++;
      if (!e.examDate) nullDate++;
      else if (e.examDate < new Date(cohort.looseDateRange.start) || e.examDate > new Date(cohort.looseDateRange.end)) badRange++;
      for (const i of e.images) {
        const t = (i.type || 'NULL').toUpperCase();
        if (typeCounts[t] !== undefined) typeCounts[t]++;
        else typeCounts.OTHER++;
      }
    }
  }
  const dupNames = [...nameDup.entries()].filter(([, n]) => n > 1);
  console.log(`  zero-img exams: ${zeroImg}`);
  console.log(`  low-img (<4) exams: ${lowImg}`);
  console.log(`  null examDate: ${nullDate}`);
  console.log(`  examDate outside range: ${badRange}`);
  console.log(`  image types: ${JSON.stringify(typeCounts)}`);
  console.log(`  duplicate normalized names within staging cohort: ${dupNames.length}`);
  dupNames.slice(0, 10).forEach(([n, c]) => console.log(`    - ${n} x${c}`));

  // Staging patient also present in MAIN DB?
  const mainPatients = await prisma.patient.findMany({ select: { id: true, name: true } });
  const mainNames = new Set(mainPatients.map((p) => normalize(p.name)));
  const overlap = [...nameDup.keys()].filter((n) => mainNames.has(n));
  console.log(`  staging patient names also in MAIN DB: ${overlap.length}`);
  overlap.slice(0, 10).forEach((n) => console.log(`    - ${n}`));
}

async function main() {
  for (const c of COHORTS) {
    await scanMain(c);
    await scanStaging(c);
  }

  await prisma.$disconnect();
  if (stagingPrisma) await stagingPrisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  if (stagingPrisma) await stagingPrisma.$disconnect();
  process.exit(1);
});
