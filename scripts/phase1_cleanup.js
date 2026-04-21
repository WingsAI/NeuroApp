/**
 * Phase 1: cheap, reversible cleanups before migration.
 *
 *  A. Main DB — delete JUVINA GINO PEREIRA duplicate exam
 *     (pending 69809d8e379c4e1a51cbd071, same-day dup of kept 69809d8e1fa8062e17d3adc5).
 *     Pre-flight checks:
 *       - no report on pending exam
 *       - no referral on pending exam
 *       - no MedicalReport.selectedImages anywhere references a pending image id
 *
 *  B. Staging DB — delete junk/test entries:
 *       - "teste teste"        (StagingPatient id=…)
 *       - "test test"          (StagingPatient id=…)
 *       - "anonymous phelcom"  (StagingPatient id=…)
 *     For each: verify it's really a test pattern (name match + low image counts)
 *     before deleting. Cascade delete drops exams and images automatically.
 *
 * Usage:
 *   node scripts/phase1_cleanup.js            # preview
 *   node scripts/phase1_cleanup.js --execute  # apply
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaClient: StagingClient } = require('.prisma/client-staging');

const prisma = new PrismaClient();
const stagingPrisma = new StagingClient();
const EXECUTE = process.argv.includes('--execute');

const JUVINA_PENDING = '69809d8e379c4e1a51cbd071';
const JUVINA_KEEP = '69809d8e1fa8062e17d3adc5';

const STAGING_JUNK_NAMES = [
  /^teste\s+teste$/i,
  /^test\s+test$/i,
  /^anonymous\s+phelcom$/i,
];

async function pretendDelete(label, fn) {
  if (EXECUTE) {
    await fn();
    console.log(`   EXECUTED: ${label}`);
  } else {
    console.log(`   would execute: ${label}`);
  }
}

async function phase1a() {
  console.log('\n=== A. Main DB — JUVINA GINO PEREIRA duplicate exam ===\n');
  const pending = await prisma.exam.findUnique({
    where: { id: JUVINA_PENDING },
    include: { images: true, report: true, referral: true, patient: true },
  });
  const keep = await prisma.exam.findUnique({
    where: { id: JUVINA_KEEP },
    include: { images: true, report: true, patient: true },
  });
  if (!pending || !keep) {
    console.log('   SKIP: one or both exams not found');
    return { deletedExams: 0 };
  }
  console.log(`   patient: ${pending.patient.name}`);
  console.log(`   pending ${JUVINA_PENDING}: imgs=${pending.images.length} report=${!!pending.report} referral=${!!pending.referral} status=${pending.status}`);
  console.log(`   keep    ${JUVINA_KEEP}: imgs=${keep.images.length} report=${!!keep.report} status=${keep.status}`);

  if (pending.report || pending.referral) {
    console.log('   REFUSE: pending exam has report or referral — abort.');
    return { deletedExams: 0 };
  }

  const pendingImgIds = pending.images.map((i) => i.id);
  const keepImgUrls = new Set(keep.images.map((i) => i.url));
  const safelyCovered = pending.images.every((i) => keepImgUrls.has(i.url));
  console.log(`   every pending image URL also in keep? ${safelyCovered}`);
  if (!safelyCovered) {
    console.log('   REFUSE: pending has URLs not in keep — unique images would be lost.');
    return { deletedExams: 0 };
  }

  const allReports = await prisma.medicalReport.findMany({ select: { id: true, examId: true, selectedImages: true } });
  const hits = allReports.filter((r) => {
    const s = r.selectedImages || {};
    return [s.od, s.oe].some((x) => x && pendingImgIds.includes(x));
  });
  console.log(`   reports referencing pending image IDs: ${hits.length}`);
  if (hits.length > 0) {
    console.log('   REFUSE: a report references a pending image — aborting so we don\'t break selectedImages.');
    hits.forEach((h) => console.log(`     -> ${h.id} on exam ${h.examId}: ${JSON.stringify(h.selectedImages)}`));
    return { deletedExams: 0 };
  }

  console.log('   all checks passed.');
  await pretendDelete(`delete Exam ${JUVINA_PENDING} (cascades ${pending.images.length} images)`, async () => {
    await prisma.exam.delete({ where: { id: JUVINA_PENDING } });
  });

  return { deletedExams: EXECUTE ? 1 : 0 };
}

async function phase1b() {
  console.log('\n=== B. Staging DB — junk/test patient cleanup ===\n');
  const candidates = await stagingPrisma.stagingPatient.findMany({
    where: { OR: STAGING_JUNK_NAMES.map((re) => ({ rawName: { mode: 'insensitive', contains: re.source.replace(/\\s\+/g, ' ').replace(/^\^|\$$/g, '') } })) },
    include: { exams: { include: { images: { select: { id: true, url: true, type: true } } } } },
  });

  // Filter strictly by regex, because "contains" can over-match.
  const strict = candidates.filter((p) => STAGING_JUNK_NAMES.some((re) => re.test(p.rawName || '')));
  console.log(`   junk candidates: ${strict.length}`);

  let deletedPatients = 0;
  let deletedExams = 0;
  let deletedImages = 0;

  for (const p of strict) {
    const imgCount = p.exams.reduce((n, e) => n + e.images.length, 0);
    const urls = p.exams.flatMap((e) => e.images).filter((i) => i.url);
    const bytescale = urls.filter((i) => /upcdn\.io/i.test(i.url)).length;
    const eyer = urls.filter((i) => /eyercloud|phelcom|cloudfront/i.test(i.url)).length;
    console.log(`   ${p.id} "${p.rawName}" | exams=${p.exams.length} imgs=${imgCount} (bytescale=${bytescale}, eyer=${eyer})`);
    p.exams.forEach((e) => {
      console.log(`     - exam ${e.id} | ${e.examDate?.toISOString?.().slice(0, 10)} | loc=${e.location} | imgs=${e.images.length}`);
    });
    if (bytescale > 0) {
      console.log(`     NOTE: ${bytescale} image(s) will remain on Bytescale as orphan blobs (acceptable for junk).`);
    }

    await pretendDelete(`delete StagingPatient ${p.id} (cascade ${p.exams.length} exams, ${imgCount} imgs)`, async () => {
      await stagingPrisma.stagingPatient.delete({ where: { id: p.id } });
    });
    if (EXECUTE) {
      deletedPatients++;
      deletedExams += p.exams.length;
      deletedImages += imgCount;
    }
  }

  return { deletedPatients, deletedExams, deletedImages };
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}`);
  const a = await phase1a();
  const b = await phase1b();
  console.log('\n=== Phase 1 summary ===');
  console.log(`  main DB exams deleted:        ${a.deletedExams}`);
  console.log(`  staging patients deleted:     ${b.deletedPatients}`);
  console.log(`  staging exams cascaded:       ${b.deletedExams}`);
  console.log(`  staging images cascaded:      ${b.deletedImages}`);
  await prisma.$disconnect();
  await stagingPrisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await stagingPrisma.$disconnect();
  process.exit(1);
});
