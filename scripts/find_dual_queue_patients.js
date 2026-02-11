/**
 * find_dual_queue_patients.js - Find patients appearing in BOTH pending and completed queues
 *
 * A patient appears in both queues when they have:
 *   - At least one completed exam (with a report)
 *   - At least one pending exam (no report, or status != 'completed')
 *
 * The medical page (laudos) uses the LATEST exam's status to determine patient status.
 * The results page shows ALL completed exams with reports.
 * So a patient with a completed exam + a pending exam (e.g., CML duplicate) will appear in both.
 *
 * In --execute mode, marks duplicate pending exams as 'completed' when:
 *   - The pending exam shares the same eyerCloudId as a completed exam (is a duplicate)
 *   - OR the pending exam is a CML exam (id starts with 'cml')
 *
 * Usage:
 *   node scripts/find_dual_queue_patients.js              # Preview (default)
 *   node scripts/find_dual_queue_patients.js --execute     # Apply fixes
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');

console.log(execute ? '=== EXECUTE MODE ===' : '=== PREVIEW MODE ===');
console.log('');

async function main() {
  // Fetch all patients with their exams and reports
  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          report: { select: { id: true } },
        },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  console.log(`Total patients in DB: ${patients.length}`);
  console.log(`Total exams in DB: ${patients.reduce((sum, p) => sum + p.exams.length, 0)}`);
  console.log('');

  const dualQueuePatients = [];
  const examsToFix = [];

  for (const patient of patients) {
    if (patient.exams.length < 1) continue;

    const completedExams = patient.exams.filter(e => e.status === 'completed' && e.report);
    const pendingExams = patient.exams.filter(e => e.status !== 'completed');

    if (completedExams.length > 0 && pendingExams.length > 0) {
      // This patient appears in both queues
      const completedEyerCloudIds = new Set(
        completedExams.map(e => e.eyerCloudId).filter(Boolean)
      );

      // Check if pending exam is same-day as a completed exam
      const completedDates = completedExams
        .map(e => e.examDate ? e.examDate.toISOString().slice(0, 10) : null)
        .filter(Boolean);

      const pendingDetails = pendingExams.map(pe => {
        const isCml = pe.id.startsWith('cml');
        const isDuplicateEyerCloudId = pe.eyerCloudId && completedEyerCloudIds.has(pe.eyerCloudId);
        const pendingDate = pe.examDate ? pe.examDate.toISOString().slice(0, 10) : null;
        const isSameDayAsCompleted = pendingDate && completedDates.includes(pendingDate);
        const isDuplicate = isCml || isDuplicateEyerCloudId || isSameDayAsCompleted;

        return {
          examId: pe.id,
          status: pe.status,
          eyerCloudId: pe.eyerCloudId || '(none)',
          isCml,
          isDuplicateEyerCloudId: !!isDuplicateEyerCloudId,
          isSameDayAsCompleted: !!isSameDayAsCompleted,
          isDuplicate,
          hasReport: !!pe.report,
        };
      });

      // Determine the latest exam (first in the array since ordered by examDate desc)
      const latestExam = patient.exams[0];
      const latestIsPending = latestExam.status !== 'completed';

      dualQueuePatients.push({
        patientId: patient.id,
        patientName: patient.name,
        totalExams: patient.exams.length,
        completedCount: completedExams.length,
        pendingCount: pendingExams.length,
        latestExamId: latestExam.id,
        latestExamStatus: latestExam.status,
        latestIsPending,
        pendingDetails,
      });

      // Collect exams eligible for auto-fix
      for (const pd of pendingDetails) {
        if (pd.isDuplicate) {
          examsToFix.push({
            patientName: patient.name,
            examId: pd.examId,
            reason: pd.isCml ? 'CML duplicate' : pd.isDuplicateEyerCloudId ? 'Same eyerCloudId as completed exam' : 'Same-day exam, other exam already has report',
          });
        }
      }
    }
  }

  // Print results
  console.log('='.repeat(80));
  console.log(`PATIENTS IN BOTH QUEUES: ${dualQueuePatients.length}`);
  console.log('='.repeat(80));
  console.log('');

  for (const dp of dualQueuePatients) {
    console.log(`--- ${dp.patientName} ---`);
    console.log(`  Patient ID: ${dp.patientId}`);
    console.log(`  Total exams: ${dp.totalExams} (${dp.completedCount} completed, ${dp.pendingCount} pending)`);
    console.log(`  Latest exam: ${dp.latestExamId} [${dp.latestExamStatus}] ${dp.latestIsPending ? '<-- causes pending status on patient' : ''}`);
    console.log(`  Pending exams:`);
    for (const pd of dp.pendingDetails) {
      const flags = [];
      if (pd.isCml) flags.push('CML');
      if (pd.isDuplicateEyerCloudId) flags.push('DUPLICATE eyerCloudId');
      if (pd.isSameDayAsCompleted) flags.push('SAME DAY as completed');
      if (pd.hasReport) flags.push('HAS REPORT');
      const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
      console.log(`    - ${pd.examId} (status: ${pd.status}, eyerCloudId: ${pd.eyerCloudId})${flagStr}`);
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Patients in both queues: ${dualQueuePatients.length}`);
  console.log(`  - With latest exam pending (appear as pending in medical page): ${dualQueuePatients.filter(dp => dp.latestIsPending).length}`);
  console.log(`Duplicate pending exams eligible for auto-fix: ${examsToFix.length}`);

  const nonDuplicatePending = dualQueuePatients.filter(dp =>
    dp.pendingDetails.some(pd => !pd.isDuplicate)
  );
  console.log(`Patients with non-duplicate pending exams (need manual review): ${nonDuplicatePending.length}`);

  if (nonDuplicatePending.length > 0) {
    console.log('');
    console.log('Non-duplicate pending exams (manual review needed):');
    for (const dp of nonDuplicatePending) {
      const nonDupExams = dp.pendingDetails.filter(pd => !pd.isDuplicate);
      for (const pd of nonDupExams) {
        console.log(`  ${dp.patientName}: exam ${pd.examId} (eyerCloudId: ${pd.eyerCloudId})`);
      }
    }
  }

  console.log('');

  // Execute mode
  if (examsToFix.length > 0) {
    console.log('='.repeat(80));
    console.log(`EXAMS TO FIX (${examsToFix.length}):`);
    console.log('='.repeat(80));
    for (const ef of examsToFix) {
      console.log(`  ${ef.patientName}: ${ef.examId} -> completed (reason: ${ef.reason})`);
    }
    console.log('');

    if (execute) {
      const ids = examsToFix.map(f => f.examId);
      const result = await prisma.exam.updateMany({
        where: { id: { in: ids } },
        data: { status: 'completed', updatedAt: new Date() },
      });
      console.log(`SUCCESS: Updated ${result.count} exams to status 'completed'`);
    } else {
      console.log('Run with --execute to apply these changes.');
    }
  } else if (dualQueuePatients.length > 0) {
    console.log('No duplicate exams found to auto-fix. Manual review needed for the pending exams listed above.');
  } else {
    console.log('No patients found in both queues. Everything looks clean!');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
