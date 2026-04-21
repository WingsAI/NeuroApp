/**
 * Phase 3 — staging → main DB migration.
 *
 * Reads staging DB, writes to main DB. No EyerCloud / no Bytescale calls.
 *
 * Dry-run numbers (from scripts/migration_dryrun_report.json):
 *   2,364 new patients   (skip 131 already migrated by ID match)
 *   2,416 new exams      (skip 131 already migrated by ID match)
 *  17,834 images kept    (COLOR + ANTERIOR with non-empty URL)
 *   4,060 images filtered (REFLEX_REMOVED / RETINA_INFRA_RED / HEATMAP / empty URL)
 *
 * Field mapping:
 *   StagingPatient.rawName       -> Patient.name
 *   StagingPatient.cpf || extracted -> Patient.cpf
 *   StagingPatient.gender ('male'/'female') -> normalized to 'Masculino' / 'Feminino'
 *   StagingExam.location || sourceLogin.clinicName -> Exam.location  (never null)
 *   StagingExam.technicianName ?? ''             -> Exam.technicianName
 *   Image UUID+url copied verbatim; only COLOR/ANTERIOR with url are kept.
 *
 * Collision policy:
 *   If a staging patient.id is already present in main.Patient, we SKIP that
 *   patient AND all of its exams/images. This matches the 131 ID collisions
 *   the dry-run found — they are the same rows already migrated in a past run.
 *   (We verified manually during planning: same id, same name, same exam ids,
 *   same image counts. Re-creating them would not help.)
 *
 * Usage:
 *   node scripts/phase3_migrate.js             # preview
 *   node scripts/phase3_migrate.js --execute   # apply
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaClient: StagingClient } = require('.prisma/client-staging');

const prisma = new PrismaClient();
const staging = new StagingClient();
const EXECUTE = process.argv.includes('--execute');
const BATCH = 500;

const KEEP_TYPES = new Set(['COLOR', 'ANTERIOR']);

function normalizeGender(g) {
  if (!g) return null;
  const s = String(g).trim().toLowerCase();
  if (s === 'male' || s === 'masculino' || s === 'm') return 'Masculino';
  if (s === 'female' || s === 'feminino' || s === 'f') return 'Feminino';
  return g;
}

async function chunkCreate(model, rows, label) {
  if (rows.length === 0) {
    console.log(`   ${label}: 0 rows — skipped`);
    return 0;
  }
  if (!EXECUTE) {
    console.log(`   ${label}: ${rows.length} rows would be inserted (${Math.ceil(rows.length / BATCH)} batches of ${BATCH})`);
    return 0;
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const res = await model.createMany({ data: slice, skipDuplicates: true });
    inserted += res.count;
    process.stdout.write(`\r   ${label}: ${inserted}/${rows.length}`);
  }
  process.stdout.write('\n');
  return inserted;
}

async function main() {
  console.log(`=== Phase 3 migration — mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'} ===\n`);

  console.log('Loading staging data...');
  const [stagingPatients, sourceLogins] = await Promise.all([
    staging.stagingPatient.findMany({
      where: { isDuplicate: false },
      include: {
        exams: { include: { images: true } },
      },
    }),
    staging.sourceLogin.findMany(),
  ]);
  const clinicByLoginId = new Map(sourceLogins.map((s) => [s.id, s.clinicName]));
  console.log(`   staging patients: ${stagingPatients.length}`);
  console.log(`   staging exams:    ${stagingPatients.reduce((n, p) => n + p.exams.length, 0)}`);
  console.log(`   staging images:   ${stagingPatients.reduce((n, p) => n + p.exams.reduce((m, e) => m + e.images.length, 0), 0)}`);

  console.log('Loading main DB key sets...');
  const [mainPatientIds, mainExamIds, mainImageIds] = await Promise.all([
    prisma.patient.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    prisma.exam.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
    prisma.examImage.findMany({ select: { id: true } }).then((r) => new Set(r.map((x) => x.id))),
  ]);
  console.log(`   main patients: ${mainPatientIds.size}`);
  console.log(`   main exams:    ${mainExamIds.size}`);
  console.log(`   main images:   ${mainImageIds.size}\n`);

  const now = new Date();
  const patientRows = [];
  const examRows = [];
  const imageRows = [];

  const skipped = { patientsAlreadyInMain: 0, examIdCollisions: 0, imageIdCollisions: 0, examsWithoutKeepImages: 0 };
  const filtered = { imagesFilteredByType: 0, imagesFilteredByEmptyUrl: 0 };
  const typesFiltered = {};

  for (const p of stagingPatients) {
    if (mainPatientIds.has(p.id)) {
      skipped.patientsAlreadyInMain++;
      continue;
    }

    const clinic = clinicByLoginId.get(p.sourceLoginId) || 'Não informado';

    patientRows.push({
      id: p.id,
      name: (p.rawName || p.normalizedName || '').trim(),
      cpf: p.cpf || p.extractedCpf || null,
      birthDate: p.birthDate,
      gender: normalizeGender(p.gender),
      phone: p.phone || null,
      underlyingDiseases: p.underlyingDiseases ?? undefined,
      ophthalmicDiseases: p.ophthalmicDiseases ?? undefined,
      createdAt: p.createdAt || now,
      updatedAt: now,
    });

    for (const e of p.exams) {
      if (mainExamIds.has(e.id)) {
        skipped.examIdCollisions++;
        continue;
      }

      const keepImages = [];
      for (const img of e.images) {
        const t = (img.type || '').toUpperCase();
        if (!KEEP_TYPES.has(t)) {
          filtered.imagesFilteredByType++;
          typesFiltered[t || 'NULL'] = (typesFiltered[t || 'NULL'] || 0) + 1;
          continue;
        }
        if (!img.url) {
          filtered.imagesFilteredByEmptyUrl++;
          continue;
        }
        if (mainImageIds.has(img.id)) {
          skipped.imageIdCollisions++;
          continue;
        }
        keepImages.push({
          id: img.id,
          url: img.url,
          fileName: img.fileName,
          type: t,
          uploadedAt: img.uploadedAt || now,
          examId: e.id,
        });
      }

      if (keepImages.length === 0) {
        skipped.examsWithoutKeepImages++;
        // still migrate the exam — preserves the record even if zero-image
      }

      examRows.push({
        id: e.id,
        examDate: e.examDate,
        location: e.location || clinic,
        technicianName: e.technicianName ?? '',
        status: 'pending',
        createdAt: e.createdAt || now,
        updatedAt: now,
        eyerCloudId: e.eyerCloudId || e.id,
        patientId: p.id,
      });

      for (const ir of keepImages) imageRows.push(ir);
    }
  }

  console.log('=== Plan ===');
  console.log(`   patients to insert:    ${patientRows.length}`);
  console.log(`   patients skipped (already in main): ${skipped.patientsAlreadyInMain}`);
  console.log(`   exams to insert:       ${examRows.length}`);
  console.log(`   exams skipped (id collision in main): ${skipped.examIdCollisions}`);
  console.log(`   exams with zero kept images (still inserted): ${skipped.examsWithoutKeepImages}`);
  console.log(`   images to insert:      ${imageRows.length}`);
  console.log(`   images skipped (id collision in main): ${skipped.imageIdCollisions}`);
  console.log(`   images filtered by type: ${filtered.imagesFilteredByType}  (${JSON.stringify(typesFiltered)})`);
  console.log(`   images filtered by empty URL: ${filtered.imagesFilteredByEmptyUrl}\n`);

  // Quick sanity: every exam's patientId must be either (a) in patientRows or (b) in main
  const newPatientIds = new Set(patientRows.map((p) => p.id));
  const orphanExams = examRows.filter((e) => !newPatientIds.has(e.patientId) && !mainPatientIds.has(e.patientId));
  if (orphanExams.length > 0) {
    console.log(`   ABORT: ${orphanExams.length} exams reference a patient not in main and not being inserted.`);
    console.log('   First offender:', orphanExams[0]);
    process.exit(2);
  }
  // And every image's examId must be in examRows or main
  const newExamIds = new Set(examRows.map((e) => e.id));
  const orphanImages = imageRows.filter((i) => !newExamIds.has(i.examId) && !mainExamIds.has(i.examId));
  if (orphanImages.length > 0) {
    console.log(`   ABORT: ${orphanImages.length} images reference an exam not in main and not being inserted.`);
    process.exit(2);
  }
  console.log('   FK integrity check passed.\n');

  if (!EXECUTE) {
    console.log('Preview complete. Re-run with --execute to apply.');
    await Promise.all([prisma.$disconnect(), staging.$disconnect()]);
    return;
  }

  console.log('=== Executing ===');
  const insPat = await chunkCreate(prisma.patient, patientRows, 'patients');
  const insExa = await chunkCreate(prisma.exam, examRows, 'exams');
  const insImg = await chunkCreate(prisma.examImage, imageRows, 'images');

  console.log('\n=== Done ===');
  console.log(`   patients inserted: ${insPat}`);
  console.log(`   exams inserted:    ${insExa}`);
  console.log(`   images inserted:   ${insImg}`);

  // Mark migrated in staging (non-blocking for main DB)
  console.log('\nMarking staging rows as migrated...');
  try {
    await staging.stagingPatient.updateMany({
      where: { id: { in: patientRows.map((p) => p.id) } },
      data: { migratedToMainDb: true, migratedAt: now },
    });
    await staging.stagingExam.updateMany({
      where: { id: { in: examRows.map((e) => e.id) } },
      data: { migratedToMainDb: true, migratedAt: now },
    });
    console.log('   staging flags updated.');
  } catch (e) {
    console.log('   WARN: failed to mark staging migrated flag:', e.message);
  }

  await Promise.all([prisma.$disconnect(), staging.$disconnect()]);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await staging.$disconnect();
  process.exit(1);
});
