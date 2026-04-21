/**
 * Phase 2 — migration dry-run. Read-only.
 *
 * Produces the exact numbers required to plan the Bytescale + DB migration:
 *   - staging patients that already exist in main (by normalized name)
 *   - staging patients that are NEW to main
 *   - staging exams with 0 images (need EyerCloud → Bytescale recovery)
 *   - staging images grouped by URL host:
 *        bytescale  (upcdn.io)       — no re-upload needed
 *        eyercloud  (cloudfront/phelcom/eyercloud) — need download+upload
 *        other      (investigate)
 *   - staging images filtered out (REFLEX_REMOVED, HEATMAP, RETINA_INFRA_RED, REDFREE)
 *   - possible conflicts: staging patient id == main patient id or exam id collisions
 *
 * Output: printed report + scripts/migration_dryrun_report.json with the full plan.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { PrismaClient: StagingClient } = require('.prisma/client-staging');

const prisma = new PrismaClient();
const stagingPrisma = new StagingClient();

const KEEP_TYPES = new Set(['COLOR', 'ANTERIOR']);
const REPORT_FILE = path.join(__dirname, 'migration_dryrun_report.json');

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function urlHost(u) {
  if (!u) return 'empty';
  if (/upcdn\.io/i.test(u)) return 'bytescale';
  if (/eyercloud|phelcom|cloudfront/i.test(u)) return 'eyercloud';
  return 'other';
}

async function main() {
  console.log('=== Migration dry-run ===\n');

  const [mainPatients, mainExams] = await Promise.all([
    prisma.patient.findMany({ select: { id: true, name: true } }),
    prisma.exam.findMany({ select: { id: true, eyerCloudId: true } }),
  ]);
  const mainNameIndex = new Map();
  mainPatients.forEach((p) => {
    const k = normalize(p.name);
    if (!mainNameIndex.has(k)) mainNameIndex.set(k, []);
    mainNameIndex.get(k).push(p);
  });
  const mainPatientIds = new Set(mainPatients.map((p) => p.id));
  const mainExamIds = new Set(mainExams.map((e) => e.id));
  const mainEyerIds = new Set(mainExams.filter((e) => e.eyerCloudId).map((e) => e.eyerCloudId));

  console.log(`Main DB: ${mainPatients.length} patients, ${mainExams.length} exams\n`);

  const sourceLogins = await stagingPrisma.sourceLogin.findMany();
  console.log(`Staging sourceLogins: ${sourceLogins.length}`);

  const summary = {
    perLogin: {},
    overall: {
      patients: 0,
      newPatients: 0,
      existingPatientCollisions: 0,
      patientIdCollisions: 0,
      exams: 0,
      examIdCollisions: 0,
      eyerIdCollisionsInMain: 0,
      zeroImageExams: 0,
      images: 0,
      imagesKept: 0,
      imagesFiltered: 0,
      imagesByHost: { bytescale: 0, eyercloud: 0, empty: 0, other: 0 },
      imagesKeptByHost: { bytescale: 0, eyercloud: 0, empty: 0, other: 0 },
      imagesByType: {},
    },
    collidingPatients: [],
    collidingPatientIds: [],
    collidingExamIds: [],
    collidingEyerIdsInMain: [],
    otherHostUrlSamples: [],
  };

  for (const login of sourceLogins) {
    console.log(`\n--- ${login.email} ---`);
    const patients = await stagingPrisma.stagingPatient.findMany({
      where: { sourceLoginId: login.id },
      include: { exams: { include: { images: { select: { id: true, type: true, url: true } } } } },
    });

    const b = {
      patients: patients.length,
      newPatients: 0,
      existingPatientCollisions: 0,
      patientIdCollisions: 0,
      exams: 0,
      examIdCollisions: 0,
      eyerIdCollisionsInMain: 0,
      zeroImageExams: 0,
      images: 0,
      imagesKept: 0,
      imagesFiltered: 0,
      imagesByHost: { bytescale: 0, eyercloud: 0, empty: 0, other: 0 },
      imagesKeptByHost: { bytescale: 0, eyercloud: 0, empty: 0, other: 0 },
      imagesByType: {},
    };

    for (const p of patients) {
      const k = normalize(p.rawName || '');
      if (mainNameIndex.has(k)) {
        b.existingPatientCollisions++;
        summary.collidingPatients.push({ staging: { id: p.id, name: p.rawName, login: login.email }, main: mainNameIndex.get(k).map((x) => ({ id: x.id, name: x.name })) });
      } else {
        b.newPatients++;
      }
      if (mainPatientIds.has(p.id)) {
        b.patientIdCollisions++;
        summary.collidingPatientIds.push({ id: p.id, stagingName: p.rawName, login: login.email });
      }

      for (const e of p.exams) {
        b.exams++;
        if (mainExamIds.has(e.id)) {
          b.examIdCollisions++;
          summary.collidingExamIds.push({ id: e.id, stagingLogin: login.email });
        }
        if (e.eyerCloudId && mainEyerIds.has(e.eyerCloudId)) {
          b.eyerIdCollisionsInMain++;
          summary.collidingEyerIdsInMain.push({ eyerCloudId: e.eyerCloudId, stagingExamId: e.id });
        }
        if (e.images.length === 0) b.zeroImageExams++;
        for (const i of e.images) {
          b.images++;
          const t = (i.type || 'NULL').toUpperCase();
          b.imagesByType[t] = (b.imagesByType[t] || 0) + 1;
          const host = urlHost(i.url);
          b.imagesByHost[host]++;
          if (KEEP_TYPES.has(t) && i.url) {
            b.imagesKept++;
            b.imagesKeptByHost[host]++;
          } else {
            b.imagesFiltered++;
          }
          if (host === 'other' && summary.otherHostUrlSamples.length < 20) {
            summary.otherHostUrlSamples.push({ url: i.url, type: t, examId: e.id });
          }
        }
      }
    }

    summary.perLogin[login.email] = b;

    // accumulate
    for (const k of Object.keys(b)) {
      if (typeof b[k] === 'number') summary.overall[k] += b[k];
      else if (k === 'imagesByHost' || k === 'imagesKeptByHost') {
        for (const h of Object.keys(b[k])) summary.overall[k][h] += b[k][h];
      } else if (k === 'imagesByType') {
        for (const t of Object.keys(b[k])) summary.overall.imagesByType[t] = (summary.overall.imagesByType[t] || 0) + b[k][t];
      }
    }

    console.log(`   patients: ${b.patients}  (new to main: ${b.newPatients}, name-collisions: ${b.existingPatientCollisions}, id-collisions: ${b.patientIdCollisions})`);
    console.log(`   exams: ${b.exams}  (id-collisions: ${b.examIdCollisions}, eyerCloudId-collisions: ${b.eyerIdCollisionsInMain})`);
    console.log(`   zero-image exams: ${b.zeroImageExams}`);
    console.log(`   images: ${b.images}  (kept: ${b.imagesKept}, filtered: ${b.imagesFiltered})`);
    console.log(`     by type: ${JSON.stringify(b.imagesByType)}`);
    console.log(`     by host: ${JSON.stringify(b.imagesByHost)}`);
    console.log(`     kept-by-host (to migrate): ${JSON.stringify(b.imagesKeptByHost)}`);
  }

  console.log('\n=== OVERALL ===');
  console.log(`   patients to migrate new:            ${summary.overall.newPatients}`);
  console.log(`   patient name-collisions (merge):    ${summary.overall.existingPatientCollisions}`);
  console.log(`   patient ID-collisions:              ${summary.overall.patientIdCollisions}`);
  console.log(`   exams to migrate:                   ${summary.overall.exams}`);
  console.log(`   exam ID-collisions:                 ${summary.overall.examIdCollisions}`);
  console.log(`   eyerCloudId collisions in main:     ${summary.overall.eyerIdCollisionsInMain}`);
  console.log(`   zero-image staging exams:           ${summary.overall.zeroImageExams}`);
  console.log(`   images kept to migrate:             ${summary.overall.imagesKept}`);
  console.log(`     already on Bytescale:             ${summary.overall.imagesKeptByHost.bytescale}`);
  console.log(`     to download+upload (EyerCloud):   ${summary.overall.imagesKeptByHost.eyercloud}`);
  console.log(`     empty URL:                        ${summary.overall.imagesKeptByHost.empty}`);
  console.log(`     other hosts:                      ${summary.overall.imagesKeptByHost.other}`);
  console.log(`   images filtered (not migrating):    ${summary.overall.imagesFiltered}`);
  console.log(`   image types seen: ${JSON.stringify(summary.overall.imagesByType)}`);

  fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2));
  console.log(`\nFull report: ${REPORT_FILE}`);

  await prisma.$disconnect();
  await stagingPrisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await stagingPrisma.$disconnect();
  process.exit(1);
});
