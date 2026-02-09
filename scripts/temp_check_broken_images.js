const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // Find ALL completed exams where selectedImages IDs don't match the exam's image IDs
  const exams = await db.exam.findMany({
    where: {
      status: 'completed',
      report: { isNot: null },
    },
    include: {
      images: { select: { id: true } },
      report: { select: { selectedImages: true } },
      patient: { select: { name: true } },
    },
  });

  console.log(`Total completed exams with reports: ${exams.length}\n`);

  let brokenCount = 0;
  const broken = [];

  for (const exam of exams) {
    const sel = exam.report?.selectedImages;
    if (!sel || typeof sel !== 'object') continue;

    const imageIds = new Set(exam.images.map(i => i.id));
    const odId = sel.od;
    const oeId = sel.oe;

    const odMissing = odId && !imageIds.has(odId);
    const oeMissing = oeId && !imageIds.has(oeId);

    if (odMissing || oeMissing) {
      brokenCount++;
      broken.push({
        name: exam.patient.name,
        examId: exam.id,
        odId,
        oeId,
        odMissing,
        oeMissing,
        imageIds: Array.from(imageIds).slice(0, 3),
      });
    }
  }

  console.log(`Exams with BROKEN selectedImages: ${brokenCount}\n`);
  for (const b of broken) {
    console.log(`  ${b.name}`);
    console.log(`    exam: ${b.examId}`);
    console.log(`    selectedImages: od=${b.odId} oe=${b.oeId}`);
    console.log(`    ${b.odMissing ? 'OD MISSING' : 'OD ok'} | ${b.oeMissing ? 'OE MISSING' : 'OE ok'}`);
    console.log(`    actual image IDs (first 3): ${b.imageIds.join(', ')}`);
    console.log();
  }

  // Also check multi-exam patients
  console.log('\n=== Multi-exam patients with mixed status ===');
  const patients = await db.patient.findMany({
    include: {
      exams: {
        select: { id: true, status: true, examDate: true },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  const mixed = patients.filter(p =>
    p.exams.length > 1 &&
    p.exams.some(e => e.status === 'completed') &&
    p.exams.some(e => e.status === 'pending')
  );

  console.log(`Patients with mixed status: ${mixed.length}`);
  for (const p of mixed) {
    const latest = p.exams[0];
    console.log(`  ${p.name}: latest=${latest.id.substring(0, 15)}(${latest.status}) | ${p.exams.map(e => e.status).join(', ')}`);
  }

  await db.$disconnect();
}
main();
