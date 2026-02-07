/**
 * cleanup_short_id_exams.js - Remove exames duplicados com IDs curtos
 * =====================================================================
 *
 * Após a importação full sync, existem exames duplicados:
 * - Exames com ID curto (8 hex chars) são resquícios do import antigo
 * - Cada paciente com exam short-ID também tem exam(s) com long-ID
 * - Laudos nos short-ID exams precisam ser movidos para o long-ID exam
 * - Imagens nos short-ID exams que não existem no long-ID são movidas
 *
 * NÃO mexe em exames cml* (criados manualmente pela UI)
 *
 * Uso:
 *   node scripts/cleanup_short_id_exams.js              # Preview
 *   node scripts/cleanup_short_id_exams.js --execute     # Aplicar
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');
  console.log('='.repeat(70));
  console.log('CLEANUP: Remover exames duplicados com IDs curtos');
  console.log('='.repeat(70));
  if (!execute) console.log('MODO PREVIEW - use --execute para aplicar\n');
  else console.log('MODO EXECUÇÃO\n');

  // Find all exams with 8-char hex IDs
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

  console.log(`Total exames: ${allExams.length}`);
  console.log(`Exames com ID curto (8 hex): ${shortIdExams.length}`);
  console.log(`Exames com ID longo (24 hex): ${longIdExams.length}`);
  console.log(`Exames cml* (manual/UI): ${allExams.filter(e => e.id.startsWith('cml')).length}`);

  let movedReports = 0;
  let movedImages = 0;
  let movedReferrals = 0;
  let deletedExams = 0;
  let errors = [];

  for (const shortExam of shortIdExams) {
    // Find the corresponding long-ID exam for the same patient
    // Prefer a long-ID exam that starts with the same prefix
    const patientLongExams = longIdExams.filter(e => e.patient.id === shortExam.patient.id);

    if (patientLongExams.length === 0) {
      console.log(`  SKIP: ${shortExam.patient.name} (${shortExam.id}) - sem exame long-ID`);
      continue;
    }

    // Pick target: prefer exam starting with same prefix, or first one with no report
    let target = patientLongExams.find(e => e.id.startsWith(shortExam.id));
    if (!target) {
      // Pick one without report first (so we can move report there)
      target = patientLongExams.find(e => !e.report) || patientLongExams[0];
    }

    const hasReport = !!shortExam.report;
    const hasReferral = !!shortExam.referral;
    const imgCount = shortExam.images.length;

    console.log(`  ${shortExam.patient.name} | ${shortExam.id} → ${target.id} | imgs: ${imgCount}, report: ${hasReport}, referral: ${hasReferral}`);

    if (!execute) {
      if (hasReport) movedReports++;
      movedImages += imgCount;
      if (hasReferral) movedReferrals++;
      deletedExams++;
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        // Move report if exists
        if (hasReport) {
          // Check if target already has a report
          const targetReport = await tx.medicalReport.findUnique({ where: { examId: target.id } });
          if (targetReport) {
            // Target already has report - delete the short one (it's a duplicate)
            console.log(`    Report: target already has report, deleting duplicate`);
            await tx.medicalReport.delete({ where: { id: shortExam.report.id } });
          } else {
            await tx.medicalReport.update({
              where: { id: shortExam.report.id },
              data: { examId: target.id }
            });
            console.log(`    Report moved`);
          }
          movedReports++;
        }

        // Move referral if exists
        if (hasReferral) {
          const targetReferral = await tx.patientReferral.findUnique({ where: { examId: target.id } });
          if (targetReferral) {
            await tx.patientReferral.delete({ where: { id: shortExam.referral.id } });
          } else {
            await tx.patientReferral.update({
              where: { id: shortExam.referral.id },
              data: { examId: target.id }
            });
          }
          movedReferrals++;
        }

        // Move images that aren't already on the target
        const targetImgUrls = new Set(
          (await tx.examImage.findMany({ where: { examId: target.id }, select: { url: true } }))
            .map(i => i.url)
        );

        for (const img of shortExam.images) {
          if (targetImgUrls.has(img.url)) {
            // Duplicate - delete
            await tx.examImage.delete({ where: { id: img.id } });
          } else {
            // Move to target
            await tx.examImage.update({
              where: { id: img.id },
              data: { examId: target.id }
            });
          }
          movedImages++;
        }

        // Delete the now-empty short-ID exam
        await tx.exam.delete({ where: { id: shortExam.id } });
        deletedExams++;
      });
    } catch (err) {
      errors.push({ name: shortExam.patient.name, id: shortExam.id, error: err.message });
      console.log(`    ERRO: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('RESULTADO');
  console.log('='.repeat(70));
  console.log(`  Reports movidos/resolvidos: ${movedReports}`);
  console.log(`  Imagens movidas/resolvidas: ${movedImages}`);
  console.log(`  Referrals movidos/resolvidos: ${movedReferrals}`);
  console.log(`  Exames deletados: ${deletedExams}`);

  if (errors.length > 0) {
    console.log(`\n  Erros: ${errors.length}`);
    errors.forEach(e => console.log(`    ${e.name} (${e.id}): ${e.error}`));
  }

  // Final counts
  const finalPatients = await prisma.patient.count();
  const finalExams = await prisma.exam.count();
  const finalImages = await prisma.examImage.count();
  const finalReports = await prisma.medicalReport.count();
  console.log(`\n  DB final: ${finalPatients} pacientes, ${finalExams} exames, ${finalImages} imagens, ${finalReports} laudos`);
  console.log(`  Target:   451 pacientes, 456 exames`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('ERRO FATAL:', err);
  await prisma.$disconnect();
  process.exit(1);
});
