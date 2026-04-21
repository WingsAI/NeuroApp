/**
 * Scans the main DB for patterns similar to the 2026-04-21 missing-photos fix.
 *
 * Patterns:
 *  A. Duplicate exams per patient where one is "empty-like" (0 imgs, or imgs but no report)
 *     while another exam has the report.
 *  B. examDate vs eyerCloudId timestamp mismatch
 *     (ObjectId first 4 bytes = Unix seconds; if |objId_ts - examDate| > 30 days, flag).
 *  C. MedicalReport.selectedImages referencing ExamImage IDs that no longer exist
 *     anywhere in the patient's exams.
 *  D. Exams with 0 images (any remaining).
 *  E. Exams whose location is a 24-char hex (clinic id not resolved).
 *
 * Read-only. Prints a report; no mutations.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function isHex24(s) { return typeof s === 'string' && /^[0-9a-f]{24}$/i.test(s); }

function objectIdTimestamp(id) {
  if (!isHex24(id)) return null;
  const secs = parseInt(id.slice(0, 8), 16);
  if (!Number.isFinite(secs)) return null;
  return new Date(secs * 1000);
}

function daysDiff(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

async function main() {
  console.log('\n=== Scanning data anomalies ===\n');

  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: { select: { id: true } },
          report: { select: { id: true, selectedImages: true } },
          referral: { select: { id: true } },
        },
      },
    },
  });

  console.log(`Loaded ${patients.length} patients\n`);

  // ---- A. Duplicate exams ----
  console.log('--- A. Duplicate exams (same patient, 2+ exams, one "empty-like") ---');
  const dupCases = [];
  for (const p of patients) {
    if (p.exams.length < 2) continue;
    const withReport = p.exams.filter((e) => !!e.report);
    const withoutReport = p.exams.filter((e) => !e.report);
    if (withReport.length >= 1 && withoutReport.length >= 1) {
      // Flag cases where one exam has no report AND no images (safe-delete candidates)
      // OR same-day duplicates where the empty one has fewer images than the reported one.
      for (const empty of withoutReport) {
        const safe = empty.images.length === 0 && !empty.referral;
        if (safe) {
          dupCases.push({
            patient: p.name,
            patientId: p.id,
            emptyExamId: empty.id,
            emptyImages: empty.images.length,
            emptyDate: empty.examDate?.toISOString?.().slice(0, 10),
            emptyLocation: empty.location,
            keepExamId: withReport[0].id,
            keepImages: withReport[0].images.length,
            keepDate: withReport[0].examDate?.toISOString?.().slice(0, 10),
            reason: '0 imgs, 0 referral, has report on another exam',
          });
        }
      }
    }
  }
  if (dupCases.length === 0) {
    console.log('  (none)');
  } else {
    dupCases.forEach((c) => {
      console.log(
        `  ${c.patient.padEnd(40)} | del ${c.emptyExamId} (imgs=${c.emptyImages} ${c.emptyDate} ${c.emptyLocation}) | keep ${c.keepExamId} (imgs=${c.keepImages} ${c.keepDate})`,
      );
    });
  }

  // ---- A2. Duplicate exams where one has no report but HAS images ----
  console.log('\n--- A2. Duplicate exams (same patient, one has report, the other has images but no report) ---');
  const dupCases2 = [];
  for (const p of patients) {
    if (p.exams.length < 2) continue;
    const withReport = p.exams.filter((e) => !!e.report);
    const withoutReport = p.exams.filter((e) => !e.report);
    if (withReport.length >= 1 && withoutReport.length >= 1) {
      for (const empty of withoutReport) {
        if (empty.images.length > 0) {
          const keep = withReport[0];
          const sameDay =
            empty.examDate &&
            keep.examDate &&
            empty.examDate.toISOString().slice(0, 10) === keep.examDate.toISOString().slice(0, 10);
          dupCases2.push({
            patient: p.name,
            patientId: p.id,
            pendingExamId: empty.id,
            pendingImages: empty.images.length,
            pendingDate: empty.examDate?.toISOString?.().slice(0, 10),
            pendingLoc: empty.location,
            reportExamId: keep.id,
            reportImages: keep.images.length,
            reportDate: keep.examDate?.toISOString?.().slice(0, 10),
            reportLoc: keep.location,
            sameDay,
            hasReferral: !!empty.referral,
          });
        }
      }
    }
  }
  if (dupCases2.length === 0) {
    console.log('  (none)');
  } else {
    dupCases2.forEach((c) => {
      console.log(
        `  ${c.patient.padEnd(40)} | pend ${c.pendingExamId} (imgs=${c.pendingImages} ${c.pendingDate} ${c.pendingLoc} refer=${c.hasReferral}) | report ${c.reportExamId} (imgs=${c.reportImages} ${c.reportDate} ${c.reportLoc}) | sameDay=${c.sameDay}`,
      );
    });
  }

  // ---- B. examDate vs eyerCloudId timestamp mismatch ----
  console.log('\n--- B. examDate vs eyerCloudId timestamp mismatch (>30 days) ---');
  const dateMismatches = [];
  for (const p of patients) {
    for (const e of p.exams) {
      const idTs = objectIdTimestamp(e.eyerCloudId || e.id);
      if (!idTs || !e.examDate) continue;
      const diff = daysDiff(idTs, e.examDate);
      if (diff > 30) {
        dateMismatches.push({
          patient: p.name,
          examId: e.id,
          eyerCloudId: e.eyerCloudId,
          examDate: e.examDate.toISOString().slice(0, 10),
          idDate: idTs.toISOString().slice(0, 10),
          diffDays: Math.round(diff),
          location: e.location,
        });
      }
    }
  }
  if (dateMismatches.length === 0) {
    console.log('  (none)');
  } else {
    dateMismatches.sort((a, b) => b.diffDays - a.diffDays);
    dateMismatches.slice(0, 30).forEach((c) => {
      console.log(
        `  ${c.patient.padEnd(40)} | exam=${c.examDate} idTs=${c.idDate} diff=${c.diffDays}d | ${c.location} | ${c.examId}`,
      );
    });
    if (dateMismatches.length > 30) console.log(`  ... (${dateMismatches.length - 30} more)`);
  }

  // ---- C. Orphan selectedImages ----
  console.log('\n--- C. Orphan selectedImages (IDs not in any of the patient exams) ---');
  const orphans = [];
  for (const p of patients) {
    const allImageIds = new Set();
    for (const e of p.exams) for (const i of e.images) allImageIds.add(i.id);
    for (const e of p.exams) {
      if (!e.report?.selectedImages) continue;
      const sel = e.report.selectedImages;
      for (const eye of ['od', 'oe']) {
        const id = sel?.[eye];
        if (id && !allImageIds.has(id)) {
          orphans.push({
            patient: p.name,
            patientId: p.id,
            examId: e.id,
            eye,
            brokenId: id,
          });
        }
      }
    }
  }
  if (orphans.length === 0) {
    console.log('  (none)');
  } else {
    orphans.forEach((o) => {
      console.log(`  ${o.patient.padEnd(40)} | ${o.eye.toUpperCase()} ${o.brokenId} | exam ${o.examId}`);
    });
  }

  // ---- D. Exams with 0 images ----
  console.log('\n--- D. Exams with 0 images ---');
  const zeroImgs = [];
  for (const p of patients) {
    for (const e of p.exams) {
      if (e.images.length === 0) {
        zeroImgs.push({
          patient: p.name,
          examId: e.id,
          eyerCloudId: e.eyerCloudId,
          examDate: e.examDate?.toISOString?.().slice(0, 10),
          location: e.location,
          status: e.status,
          hasReport: !!e.report,
        });
      }
    }
  }
  if (zeroImgs.length === 0) {
    console.log('  (none)');
  } else {
    zeroImgs.forEach((z) => {
      console.log(
        `  ${z.patient.padEnd(40)} | ${z.examId} (eyer=${z.eyerCloudId}) | ${z.examDate} ${z.location} | status=${z.status} report=${z.hasReport}`,
      );
    });
  }

  // ---- E. Location is still a hex clinic id ----
  console.log('\n--- E. Exams whose location is a 24-char hex (unresolved clinic id) ---');
  const badLoc = [];
  for (const p of patients) {
    for (const e of p.exams) {
      if (isHex24(e.location)) {
        badLoc.push({
          patient: p.name,
          examId: e.id,
          location: e.location,
          examDate: e.examDate?.toISOString?.().slice(0, 10),
        });
      }
    }
  }
  if (badLoc.length === 0) {
    console.log('  (none)');
  } else {
    badLoc.forEach((b) => {
      console.log(`  ${b.patient.padEnd(40)} | ${b.examId} | loc=${b.location} | date=${b.examDate}`);
    });
  }

  console.log('\n=== Summary ===');
  console.log(`  A  safe-delete empty duplicates: ${dupCases.length}`);
  console.log(`  A2 review duplicates with imgs:  ${dupCases2.length}`);
  console.log(`  B  date/id mismatches:           ${dateMismatches.length}`);
  console.log(`  C  orphan selectedImages:        ${orphans.length}`);
  console.log(`  D  zero-image exams:             ${zeroImgs.length}`);
  console.log(`  E  unresolved clinic id in loc:  ${badLoc.length}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
