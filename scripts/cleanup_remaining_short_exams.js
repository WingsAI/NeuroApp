/**
 * cleanup_remaining_short_exams.js - Limpa os exames short-ID remanescentes
 * Processa sem usar transaction para evitar timeout em exames com muitas imagens
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(execute ? 'MODO EXECUÇÃO' : 'MODO PREVIEW');

  const allExams = await prisma.exam.findMany({
    include: {
      images: true,
      report: true,
      referral: true,
      patient: { select: { id: true, name: true } }
    }
  });

  const shortIdExams = allExams.filter(e => /^[a-f0-9]{8}$/.test(e.id));
  const longIdExams = allExams.filter(e => /^[a-f0-9]{24}$/.test(e.id));

  console.log(`Remaining short-ID exams: ${shortIdExams.length}`);

  let deleted = 0;
  let movedImages = 0;
  let errors = [];

  for (const shortExam of shortIdExams) {
    const patientLongExams = longIdExams.filter(e => e.patient.id === shortExam.patient.id);
    if (patientLongExams.length === 0) {
      console.log(`SKIP: ${shortExam.patient.name} - no long-ID exam`);
      continue;
    }

    let target = patientLongExams.find(e => e.id.startsWith(shortExam.id)) || patientLongExams.find(e => !e.report) || patientLongExams[0];

    console.log(`${shortExam.patient.name} | ${shortExam.id} → ${target.id} | imgs: ${shortExam.images.length}, report: ${!!shortExam.report}`);

    if (!execute) continue;

    try {
      // Step 1: Move report if exists (should already be done, but check)
      if (shortExam.report) {
        const targetReport = await prisma.medicalReport.findUnique({ where: { examId: target.id } });
        if (targetReport) {
          await prisma.medicalReport.delete({ where: { id: shortExam.report.id } });
          console.log(`  Report: deleted duplicate`);
        } else {
          await prisma.medicalReport.update({
            where: { id: shortExam.report.id },
            data: { examId: target.id }
          });
          console.log(`  Report: moved`);
        }
      }

      // Step 2: Move referral if exists
      if (shortExam.referral) {
        const targetRef = await prisma.patientReferral.findUnique({ where: { examId: target.id } });
        if (targetRef) {
          await prisma.patientReferral.delete({ where: { id: shortExam.referral.id } });
        } else {
          await prisma.patientReferral.update({
            where: { id: shortExam.referral.id },
            data: { examId: target.id }
          });
        }
      }

      // Step 3: Move images in batches (no transaction)
      const targetImgUrls = new Set(
        (await prisma.examImage.findMany({ where: { examId: target.id }, select: { url: true } }))
          .map(i => i.url)
      );

      for (const img of shortExam.images) {
        try {
          if (targetImgUrls.has(img.url)) {
            await prisma.examImage.delete({ where: { id: img.id } });
          } else {
            await prisma.examImage.update({
              where: { id: img.id },
              data: { examId: target.id }
            });
          }
          movedImages++;
        } catch (imgErr) {
          console.log(`  Image error: ${imgErr.message.substring(0, 80)}`);
        }
      }

      // Step 4: Delete the exam (now should be empty)
      await prisma.exam.delete({ where: { id: shortExam.id } });
      deleted++;
      console.log(`  Deleted exam ${shortExam.id}`);
    } catch (err) {
      errors.push({ name: shortExam.patient.name, id: shortExam.id, error: err.message.substring(0, 100) });
      console.log(`  ERROR: ${err.message.substring(0, 100)}`);
    }
  }

  const finalExams = await prisma.exam.count();
  const finalPatients = await prisma.patient.count();
  const finalImages = await prisma.examImage.count();
  const finalReports = await prisma.medicalReport.count();

  console.log(`\nDeleted: ${deleted} exams, moved: ${movedImages} images`);
  console.log(`DB: ${finalPatients} patients, ${finalExams} exams, ${finalImages} images, ${finalReports} reports`);

  if (errors.length > 0) {
    console.log(`Errors: ${errors.length}`);
    errors.forEach(e => console.log(`  ${e.name}: ${e.error}`));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
