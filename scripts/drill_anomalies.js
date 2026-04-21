/**
 * Drill-down on concrete anomalies surfaced by scan_jaci_melina_mozania.js.
 * Read-only.
 *
 * 1. JACI low-image exams (<4 imgs). Detail per-exam: types, patient other exams, report?
 * 2. JACI "no report & status != pending" — which exam is this?
 * 3. JACI pending exams detail
 * 4. Staging MELINA zero-image exams — list them
 * 5. Staging MOZANIA zero-image exams — list them
 * 6. Staging MELINA exams with examDate outside 2023-2026 — list them
 * 7. Staging MELINA images with type NULL/OTHER — sample to see what types actually are
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
let stagingPrisma = null;
try {
  const { PrismaClient: StagingClient } = require('.prisma/client-staging');
  stagingPrisma = new StagingClient();
} catch (e) {}

function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }

async function main() {
  console.log('\n### 1. JACI low-image exams (<4 imgs) ###\n');
  const jaciLow = await prisma.exam.findMany({
    where: { location: { contains: 'Jaci' } },
    include: {
      patient: { include: { exams: { include: { images: { select: { id: true } } } } } },
      images: { select: { id: true, type: true, fileName: true } },
      report: { select: { id: true } },
    },
  });
  const low = jaciLow.filter((e) => e.images.length > 0 && e.images.length < 4);
  for (const e of low) {
    const other = e.patient.exams.filter((x) => x.id !== e.id);
    const totalOtherImgs = other.reduce((n, x) => n + x.images.length, 0);
    const colors = e.images.filter((i) => i.type === 'COLOR').length;
    const antes = e.images.filter((i) => i.type === 'ANTERIOR').length;
    console.log(`  ${e.patient.name.padEnd(40)} | ${e.id} | ${ymd(e.examDate)} | imgs=${e.images.length} (C=${colors} A=${antes}) | report=${!!e.report} | other exams: ${other.length} (${totalOtherImgs} imgs)`);
  }

  console.log('\n### 2. JACI "no report & status != pending" ###\n');
  const jaciMisstatus = jaciLow.filter((e) => !e.report && e.status !== 'pending');
  jaciMisstatus.forEach((e) => {
    console.log(`  ${e.patient.name} | ${e.id} | ${ymd(e.examDate)} | imgs=${e.images.length} | status=${e.status}`);
  });

  console.log('\n### 3. JACI pending exams detail ###\n');
  const pending = jaciLow.filter((e) => e.status === 'pending');
  for (const e of pending) {
    const other = e.patient.exams.filter((x) => x.id !== e.id);
    console.log(`  ${e.patient.name.padEnd(40)} | ${e.id} | ${ymd(e.examDate)} | imgs=${e.images.length}`);
    other.forEach((o) => console.log(`      also has exam ${o.id} | ${ymd(o.examDate)} | imgs=${o.images.length}`));
  }

  if (stagingPrisma) {
    for (const cohort of [
      { name: 'MELINA', email: 'dramelinalannes.endocrino@gmail.com' },
      { name: 'MOZANIA', email: 'mozaniareis@usp.br' },
    ]) {
      console.log(`\n### 4/5. Staging ${cohort.name} zero-image & low-image exams ###\n`);
      const login = await stagingPrisma.sourceLogin.findFirst({ where: { email: cohort.email } });
      if (!login) { console.log(`  (login not found)`); continue; }
      const patients = await stagingPrisma.stagingPatient.findMany({
        where: { sourceLoginId: login.id },
        include: { exams: { include: { images: { select: { id: true, type: true, url: true } } } } },
      });
      const zero = [];
      const low = [];
      for (const p of patients) {
        for (const e of p.exams) {
          if (e.images.length === 0) zero.push({ p, e });
          else if (e.images.length < 4) low.push({ p, e });
        }
      }
      console.log(`  Zero-image staging exams: ${zero.length}`);
      zero.slice(0, 30).forEach(({ p, e }) =>
        console.log(`    - ${p.rawName} | exam ${e.id} eyer=${e.eyerCloudId} | ${ymd(e.examDate)} loc=${e.location}`)
      );
      if (zero.length > 30) console.log(`    ... (${zero.length - 30} more)`);
      console.log(`  Low-image (<4) staging exams: ${low.length}`);
      low.slice(0, 20).forEach(({ p, e }) =>
        console.log(`    - ${p.rawName} | exam ${e.id} | ${ymd(e.examDate)} | imgs=${e.images.length} | loc=${e.location}`)
      );
    }

    console.log(`\n### 6. Staging MELINA examDate outside range (first 30) ###\n`);
    const login = await stagingPrisma.sourceLogin.findFirst({ where: { email: 'dramelinalannes.endocrino@gmail.com' } });
    const melinaExams = await stagingPrisma.stagingExam.findMany({
      where: { patient: { sourceLoginId: login.id } },
      include: { patient: { select: { rawName: true } } },
    });
    const lo = new Date('2023-01-01'), hi = new Date('2026-12-31');
    const outOfRange = melinaExams.filter((e) => e.examDate && (e.examDate < lo || e.examDate > hi));
    console.log(`  Total out-of-range: ${outOfRange.length}`);
    outOfRange.slice(0, 30).forEach((e) => console.log(`    - ${e.patient.rawName} | ${ymd(e.examDate)} | loc=${e.location} | exam ${e.id}`));

    console.log(`\n### 7. Staging MELINA images type distribution + samples ###\n`);
    const melinaImgs = await stagingPrisma.stagingExamImage.findMany({
      where: { exam: { patient: { sourceLoginId: login.id } } },
      select: { id: true, type: true, url: true },
    });
    const typeMap = {};
    for (const i of melinaImgs) {
      const k = (i.type || 'NULL').toUpperCase();
      typeMap[k] = (typeMap[k] || 0) + 1;
    }
    console.log(`  types: ${JSON.stringify(typeMap)}`);
    const weird = melinaImgs.filter((i) => !['COLOR', 'ANTERIOR'].includes((i.type || '').toUpperCase()));
    console.log(`  non-standard-type images: ${weird.length}`);
    weird.slice(0, 10).forEach((i) => console.log(`    - type=${i.type} | url=${i.url?.slice(0, 80)}`));
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
