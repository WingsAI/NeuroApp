const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Get all exams with their images and patient name
  const exams = await prisma.exam.findMany({
    include: {
      images: true,
      patient: { select: { name: true } }
    }
  });

  console.log(`Scanning ${exams.length} exams for misplaced images...\n`);

  let totalMisplaced = 0;
  const problems = [];

  for (const exam of exams) {
    if (exam.images.length === 0) continue;

    // Extract patient folder name from each image URL
    // URL pattern: .../neuroapp/patients/PATIENT_NAME_SHORTID/uuid.jpg
    const foreignImages = [];
    const ownImages = [];

    // Get the expected patient folder prefix from the patient's name
    // Normalize patient name to match URL encoding pattern
    const patientName = exam.patient?.name || '';

    for (const img of exam.images) {
      if (!img.url) continue;

      // Extract folder name from URL
      const match = img.url.match(/\/patients\/([^/]+)\//);
      if (!match) continue;

      const folderName = decodeURIComponent(match[1]);

      // Extract the patient name part (everything before the last _SHORTID)
      const folderParts = folderName.match(/^(.+)_([a-f0-9]{8})$/);
      if (!folderParts) continue;

      const folderPatientName = folderParts[1].replace(/_/g, ' ');
      const folderShortId = folderParts[2];

      // Compare folder patient name with exam's patient name
      // Normalize both for comparison
      const normalizedFolder = folderPatientName.toUpperCase().normalize('NFC');
      const normalizedPatient = patientName.toUpperCase().normalize('NFC');

      if (normalizedFolder !== normalizedPatient) {
        foreignImages.push({
          imageId: img.id,
          imageUrl: img.url,
          folderPatientName: folderPatientName,
          folderShortId: folderShortId
        });
      } else {
        ownImages.push(img);
      }
    }

    if (foreignImages.length > 0) {
      totalMisplaced += foreignImages.length;
      const problem = {
        examId: exam.id,
        eyerCloudId: exam.eyerCloudId,
        patientName: patientName,
        totalImages: exam.images.length,
        ownImages: ownImages.length,
        foreignImages: foreignImages
      };
      problems.push(problem);

      console.log(`PROBLEM: ${patientName} (exam ${exam.id})`);
      console.log(`  Total: ${exam.images.length} images, Own: ${ownImages.length}, Foreign: ${foreignImages.length}`);

      // Group foreign images by source patient
      const bySource = {};
      for (const fi of foreignImages) {
        const key = fi.folderPatientName;
        if (!bySource[key]) bySource[key] = [];
        bySource[key].push(fi);
      }
      for (const [source, imgs] of Object.entries(bySource)) {
        console.log(`  -> ${imgs.length} images from: ${source}`);
        imgs.forEach(fi => console.log(`     ${fi.imageId}`));
      }
      console.log();
    }
  }

  console.log('='.repeat(60));
  console.log(`SUMMARY: ${problems.length} exams with misplaced images, ${totalMisplaced} total misplaced images`);

  if (problems.length > 0) {
    console.log('\nAffected patients:');
    for (const p of problems) {
      console.log(`  ${p.patientName}: ${p.foreignImages.length} foreign images (has ${p.ownImages} own)`);
    }
  }

  // Also check: ANTONIO BENEDITO SOARES who had images from ROBSON TRIDICO
  console.log('\n--- Also checking ANTONIO BENEDITO SOARES (known issue from earlier) ---');
  const absExam = exams.find(e => e.id === '697d03f68bc8fc9984f742ca');
  if (absExam) {
    console.log(`Images: ${absExam.images.length}`);
    for (const img of absExam.images) {
      const match = img.url.match(/\/patients\/([^/]+)\//);
      if (match) {
        const folder = decodeURIComponent(match[1]);
        console.log(`  ${img.id} -> folder: ${folder}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
