const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // Simular o que getPatientsAction faz para 1 paciente completed
  const patient = await db.patient.findFirst({
    where: { exams: { some: { status: 'completed', report: { isNot: null } } } },
    include: {
      exams: {
        include: { images: true, report: true },
        orderBy: { examDate: 'desc' },
      },
    },
  });

  if (!patient) {
    console.log('No completed patient found');
    return;
  }

  console.log('Patient:', patient.name);
  console.log('Exams:', patient.exams.length);

  for (const exam of patient.exams) {
    console.log(`\n  Exam ${exam.id} (${exam.status}):`);
    console.log(`    Images: ${exam.images.length}`);
    console.log(`    Has report: ${!!exam.report}`);
    if (exam.report) {
      console.log(`    selectedImages:`, exam.report.selectedImages);
    }
    if (exam.images.length > 0) {
      console.log(`    First image ID: ${exam.images[0].id}`);
      console.log(`    First image URL: ${exam.images[0].url?.substring(0, 60)}`);
    }
  }

  // The latestExam logic
  const latestExam = patient.exams[0];
  console.log('\n--- getPatientsAction would return ---');
  console.log('status:', latestExam?.status);
  console.log('images count:', latestExam?.images?.length);
  console.log('report:', latestExam?.report ? 'YES' : 'NO');

  // Check: does the completed exam have images?
  const completedExam = patient.exams.find(e => e.status === 'completed' && e.report);
  if (completedExam && completedExam.id !== latestExam.id) {
    console.log('\n!!! WARNING: Latest exam is NOT the completed one!');
    console.log('Latest exam:', latestExam.id, latestExam.status);
    console.log('Completed exam:', completedExam.id, completedExam.status);
    console.log('Completed exam images:', completedExam.images.length);
  }

  await db.$disconnect();
}
main();
