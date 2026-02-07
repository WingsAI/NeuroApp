const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find all exams with short IDs (less than 24 chars)
  const allExams = await prisma.exam.findMany({
    include: {
      images: { select: { id: true } },
      report: { select: { id: true, doctorName: true } },
      referral: { select: { id: true } },
      patient: { select: { id: true, name: true } }
    }
  });

  const shortIdExams = allExams.filter(e => e.id.length < 24);
  const longIdExams = allExams.filter(e => e.id.length === 24);

  console.log(`Total exams: ${allExams.length}`);
  console.log(`Short ID exams (< 24 chars): ${shortIdExams.length}`);
  console.log(`Long ID exams (24 chars): ${longIdExams.length}`);

  // Categorize short-ID exams
  let withReports = 0;
  let withImages = 0;
  let withReferrals = 0;
  let empty = 0;

  console.log('\n=== SHORT-ID EXAMS DETAIL ===');
  for (const exam of shortIdExams) {
    const hasReport = !!exam.report;
    const hasImgs = exam.images.length > 0;
    const hasRef = !!exam.referral;

    if (hasReport) withReports++;
    if (hasImgs) withImages++;
    if (hasRef) withReferrals++;
    if (!hasReport && !hasImgs && !hasRef) empty++;

    console.log(`  ${exam.id} (${exam.id.length} chars) | Patient: ${exam.patient.name} | Imgs: ${exam.images.length} | Report: ${hasReport ? 'YES - ' + exam.report.doctorName : 'no'} | Referral: ${hasRef ? 'YES' : 'no'}`);
  }

  console.log(`\nSummary:`);
  console.log(`  With reports: ${withReports} (CANNOT DELETE)`);
  console.log(`  With images (no reports): ${shortIdExams.filter(e => e.images.length > 0 && !e.report).length}`);
  console.log(`  With referrals: ${withReferrals}`);
  console.log(`  Empty (no imgs, no report, no ref): ${empty}`);

  // Check if these short-ID exams have corresponding long-ID exams for the same patient
  console.log('\n=== OVERLAP CHECK ===');
  let redundant = 0;
  for (const shortExam of shortIdExams) {
    const patientLongExams = longIdExams.filter(e => e.patient.id === shortExam.patient.id);
    if (patientLongExams.length > 0) {
      redundant++;
    }
  }
  console.log(`Short-ID exams where patient also has long-ID exams: ${redundant}/${shortIdExams.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
