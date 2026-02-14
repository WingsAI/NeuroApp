const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const patients = await p.patient.findMany({
    where: { name: { contains: 'ANTONIA PAULA', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: true,
          report: { select: { id: true, selectedImages: true } },
          referral: { select: { id: true } }
        }
      }
    }
  });

  for (const pat of patients) {
    console.log(`Patient: ${pat.name} (ID: ${pat.id})`);
    for (const exam of pat.exams) {
      console.log(`\n  Exam: ${exam.id}`);
      console.log(`    eyerCloudId: ${exam.eyerCloudId}`);
      console.log(`    status: ${exam.status}`);
      console.log(`    images: ${exam.images.length}`);
      console.log(`    report: ${exam.report ? 'YES' : 'NO'}`);
      if (exam.report) {
        console.log(`    selectedImages: ${JSON.stringify(exam.report.selectedImages)}`);
      }
      console.log(`    referral: ${exam.referral ? 'YES' : 'NO'}`);
      console.log(`    images:`, exam.images.map(i => `${i.id} (${i.type})`));
    }
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
