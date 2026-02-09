/**
 * fix_duplicate_cml_status.js - Mark duplicate CML exams as completed
 *
 * 34 patients have both an EyerCloud exam (completed) and a CML duplicate (pending).
 * The CML exams are manual duplicates and should also be marked completed.
 *
 * Usage:
 *   node scripts/fix_duplicate_cml_status.js              # Preview
 *   node scripts/fix_duplicate_cml_status.js --execute     # Apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');
console.log(execute ? '=== EXECUTE ===' : '=== PREVIEW ===');

async function main() {
  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        select: { id: true, status: true, eyerCloudId: true },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  const toFix = [];

  for (const p of patients) {
    if (p.exams.length < 2) continue;

    const hasCompleted = p.exams.some(e => e.status === 'completed');
    const pendingExams = p.exams.filter(e => e.status === 'pending');

    if (hasCompleted && pendingExams.length > 0) {
      for (const pe of pendingExams) {
        toFix.push({ patientName: p.name, examId: pe.id });
        console.log(`  ${p.name}: ${pe.id} pending -> completed`);
      }
    }
  }

  console.log(`\nTotal exams to fix: ${toFix.length}`);

  if (execute && toFix.length > 0) {
    const ids = toFix.map(f => f.examId);
    await prisma.exam.updateMany({
      where: { id: { in: ids } },
      data: { status: 'completed', updatedAt: new Date() },
    });
    console.log(`Updated ${ids.length} exams to completed`);
  } else if (toFix.length > 0) {
    console.log(`\nRun with --execute to apply`);
  }

  await prisma.$disconnect();
}
main();
