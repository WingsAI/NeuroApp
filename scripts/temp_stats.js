const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  const patients = await db.patient.count();
  const exams = await db.exam.count();
  const images = await db.examImage.count();
  const reports = await db.medicalReport.count();
  const referrals = await db.patientReferral.count();

  const examsByStatus = await db.exam.groupBy({ by: ['status'], _count: true });
  const colorImages = await db.examImage.count({ where: { type: 'COLOR' } });
  const anteriorImages = await db.examImage.count({ where: { type: 'ANTERIOR' } });

  const eyercloudExams = await db.exam.count({ where: { eyerCloudId: { not: null } } });
  const cmlExams = await db.exam.count({ where: { id: { startsWith: 'cml' } } });

  const withDiseases = await db.patient.count({
    where: {
      OR: [
        { underlyingDiseases: { path: ['diabetes'], equals: true } },
        { underlyingDiseases: { path: ['hypertension'], equals: true } },
        { underlyingDiseases: { path: ['cholesterol'], equals: true } },
        { underlyingDiseases: { path: ['smoker'], equals: true } },
        { ophthalmicDiseases: { path: ['cataract'], equals: true } },
        { ophthalmicDiseases: { path: ['diabeticRetinopathy'], equals: true } },
        { ophthalmicDiseases: { path: ['glaucoma'], equals: true } },
      ]
    }
  });

  console.log('=== DB Stats 2026-02-08 ===');
  console.log(`Patients: ${patients}`);
  console.log(`Exams: ${exams} (${eyercloudExams} EyerCloud + ${cmlExams} CML)`);
  console.log(`Images: ${images} (${colorImages} COLOR + ${anteriorImages} ANTERIOR)`);
  console.log(`Reports: ${reports}`);
  console.log(`Referrals: ${referrals}`);
  console.log(`Exam status:`, examsByStatus.map(s => `${s.status}=${s._count}`).join(', '));
  console.log(`Patients with diseases: ${withDiseases}`);

  await db.$disconnect();
}
main();
