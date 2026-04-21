const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const [p, e, i, r] = await Promise.all([
    prisma.patient.count(),
    prisma.exam.count(),
    prisma.examImage.count(),
    prisma.medicalReport.count(),
  ]);
  console.log(`patients: ${p}`);
  console.log(`exams:    ${e}`);
  console.log(`images:   ${i}`);
  console.log(`reports:  ${r}`);
  const zeroImg = await prisma.exam.findMany({ include: { images: { select: { id: true } } } });
  console.log(`zero-img exams: ${zeroImg.filter((x) => x.images.length === 0).length}`);
  const dupIds = await prisma.$queryRaw`SELECT id, COUNT(*)::int AS n FROM "Exam" GROUP BY id HAVING COUNT(*)>1`;
  console.log(`duplicate exam ids: ${dupIds.length}`);
  const byLoc = await prisma.exam.groupBy({ by: ['location'], _count: { _all: true } });
  console.log('exams by location:');
  byLoc.forEach((x) => console.log(`   ${x.location.padEnd(40)} ${x._count._all}`));
  await prisma.$disconnect();
})();
