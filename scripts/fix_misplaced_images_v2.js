const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXECUTE = process.argv.includes('--execute');

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}`);
  console.log();

  const exams = await prisma.exam.findMany({
    include: {
      images: true,
      patient: { select: { name: true, id: true } },
      report: { select: { id: true } }
    }
  });

  console.log(`Scanning ${exams.length} exams...\n`);

  let totalToDelete = 0;
  let affectedExams = 0;
  const allIdsToDelete = [];

  for (const exam of exams) {
    if (exam.images.length === 0) continue;

    const patientName = exam.patient?.name || '';
    const foreignImageIds = [];

    for (const img of exam.images) {
      if (!img.url) continue;

      // Extract folder name from URL
      const match = img.url.match(/\/patients\/([^/]+)\//);
      if (!match) continue;

      const folderName = decodeURIComponent(match[1]);

      // Try both short ID (8 chars) and long ID (24 chars) suffixes
      const folderParts = folderName.match(/^(.+)_([a-f0-9]{8,24})$/);
      if (!folderParts) continue;

      const folderPatientName = folderParts[1].replace(/_/g, ' ');

      // Compare normalized names
      const normalizedFolder = folderPatientName.toUpperCase().normalize('NFC');
      const normalizedPatient = patientName.toUpperCase().normalize('NFC');

      if (normalizedFolder !== normalizedPatient) {
        foreignImageIds.push(img.id);
      }
    }

    if (foreignImageIds.length > 0) {
      affectedExams++;
      totalToDelete += foreignImageIds.length;
      const remaining = exam.images.length - foreignImageIds.length;
      const hasReport = !!exam.report;

      console.log(`${patientName} (${exam.id}): ${foreignImageIds.length} foreign, ${remaining} own${hasReport ? ' [HAS REPORT]' : ''}`);
      allIdsToDelete.push(...foreignImageIds);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY:`);
  console.log(`  Affected exams: ${affectedExams}`);
  console.log(`  Images to delete: ${totalToDelete}`);

  if (EXECUTE && allIdsToDelete.length > 0) {
    console.log(`\nDeleting ${allIdsToDelete.length} misplaced images...`);
    const batchSize = 500;
    let deleted = 0;
    for (let i = 0; i < allIdsToDelete.length; i += batchSize) {
      const batch = allIdsToDelete.slice(i, i + batchSize);
      const result = await prisma.examImage.deleteMany({
        where: { id: { in: batch } }
      });
      deleted += result.count;
      console.log(`  Batch ${Math.floor(i / batchSize) + 1}: deleted ${result.count} (total: ${deleted})`);
    }
    console.log(`\nDone. Deleted ${deleted} misplaced images.`);
    const totalImages = await prisma.examImage.count();
    console.log(`Total images remaining in DB: ${totalImages}`);
  } else if (!EXECUTE && allIdsToDelete.length > 0) {
    console.log('\nRun with --execute to apply changes.');
  } else {
    console.log('\nNo misplaced images found! Database is clean.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
