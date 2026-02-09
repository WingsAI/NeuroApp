const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // ALICE ALVES
  console.log('=== ALICE ALVES ===');
  const alice = await db.patient.findMany({
    where: { name: { contains: 'ALICE', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { select: { id: true, url: true } },
          report: { select: { id: true, selectedImages: true, completedAt: true } },
          referral: { select: { id: true } },
        },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  for (const p of alice) {
    console.log(`\n  Patient: ${p.name} (${p.id})`);
    for (const e of p.exams) {
      console.log(`    Exam: ${e.id} status=${e.status} images=${e.images.length} report=${!!e.report} referral=${!!e.referral}`);
      if (e.report) {
        console.log(`      selectedImages:`, e.report.selectedImages);
        console.log(`      completedAt:`, e.report.completedAt);
      }
      if (e.images.length > 0) {
        console.log(`      image IDs:`, e.images.map(i => i.id).join(', '));
      }
    }
  }

  // ANTONIO FERNANDES CAMARA
  console.log('\n\n=== ANTONIO FERNANDES CAMARA ===');
  const antonio = await db.patient.findMany({
    where: { name: { contains: 'ANTONIO FERNANDES', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { select: { id: true } },
          report: { select: { id: true, selectedImages: true } },
          referral: { select: { id: true, status: true } },
        },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  for (const p of antonio) {
    console.log(`\n  Patient: ${p.name} (${p.id})`);
    for (const e of p.exams) {
      console.log(`    Exam: ${e.id} status=${e.status} images=${e.images.length} report=${!!e.report} referral=${!!e.referral}`);
      if (e.report) console.log(`      report:`, e.report.id);
      if (e.referral) console.log(`      referral:`, e.referral.id, 'status:', e.referral.status);
    }
  }

  await db.$disconnect();
}
main();
