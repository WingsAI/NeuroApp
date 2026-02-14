const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const patients = await p.patient.findMany({
    where: { name: { contains: 'ELIVAN', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: true,
          report: { select: { id: true, selectedImages: true, findings: true, doctorName: true } },
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
      console.log(`    location: ${exam.location}`);
      console.log(`    images: ${exam.images.length}`);
      console.log(`    report: ${exam.report ? 'YES (id: ' + exam.report.id + ')' : 'NO'}`);
      if (exam.report) {
        console.log(`    selectedImages: ${JSON.stringify(exam.report.selectedImages)}`);
        console.log(`    doctor: ${exam.report.doctorName}`);
        console.log(`    findings: ${exam.report.findings?.substring(0, 80)}...`);
      }
      console.log(`    referral: ${exam.referral ? 'YES' : 'NO'}`);
      console.log(`    images:`, exam.images.map(i => `${i.id} (${i.type})`));
    }
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
