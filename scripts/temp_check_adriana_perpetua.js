const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // ADRIANA PERPETUA DA SILVA
  const pat = await db.patient.findMany({
    where: { name: { contains: 'ADRIANA PERPETUA', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          report: { select: { id: true } },
        },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  for (const p of pat) {
    console.log(`Patient: ${p.name} (${p.id})`);
    console.log(`  Exams: ${p.exams.length}`);
    for (const e of p.exams) {
      console.log(`    ${e.id} status=${e.status} date=${e.examDate?.toISOString()} report=${!!e.report}`);
    }
  }

  // Count ALL patients with at least one completed exam AND at least one pending exam
  console.log('\n=== Patients appearing in BOTH lists (pending + completed) ===');
  const patients = await db.patient.findMany({
    include: {
      exams: {
        select: { id: true, status: true, examDate: true },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  const inBoth = patients.filter(p =>
    p.exams.some(e => e.status === 'completed') &&
    p.exams.some(e => e.status === 'pending')
  );

  console.log(`Total: ${inBoth.length}\n`);
  for (const p of inBoth) {
    const completed = p.exams.filter(e => e.status === 'completed');
    const pending = p.exams.filter(e => e.status === 'pending');
    console.log(`  ${p.name}: ${completed.length} completed, ${pending.length} pending`);
    for (const e of p.exams) {
      console.log(`    ${e.id.substring(0, 20)}... status=${e.status}`);
    }
  }

  await db.$disconnect();
}
main();
