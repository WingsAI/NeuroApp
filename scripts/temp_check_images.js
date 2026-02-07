const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find exams with more than 20 images
  const exams = await prisma.exam.findMany({
    include: {
      images: { select: { id: true, url: true } },
      patient: { select: { name: true } }
    }
  });

  const bigExams = exams.filter(e => e.images.length > 20);
  console.log(`Exams with > 20 images: ${bigExams.length}`);
  console.log();

  bigExams
    .sort((a, b) => b.images.length - a.images.length)
    .forEach(e => {
      console.log(`  ${e.patient.name} | exam: ${e.id} | ${e.images.length} imgs`);
    });

  // Also check patients with multiple exams that have lots of total images
  console.log('\n=== PATIENTS BY TOTAL IMAGES ===');
  const patientImages = {};
  for (const exam of exams) {
    const name = exam.patient.name;
    if (!patientImages[name]) patientImages[name] = { exams: 0, images: 0, details: [] };
    patientImages[name].exams++;
    patientImages[name].images += exam.images.length;
    patientImages[name].details.push({ examId: exam.id.substring(0, 16), imgs: exam.images.length });
  }

  const bigPatients = Object.entries(patientImages)
    .filter(([_, d]) => d.images > 20)
    .sort((a, b) => b[1].images - a[1].images);

  console.log(`Patients with > 20 total images: ${bigPatients.length}`);
  bigPatients.slice(0, 20).forEach(([name, d]) => {
    console.log(`  ${name} | ${d.exams} exams | ${d.images} total imgs`);
    d.details.forEach(det => console.log(`    exam ${det.examId}... : ${det.imgs} imgs`));
  });

  // Check for duplicate URLs within the same exam
  console.log('\n=== DUPLICATE IMAGE URLS PER EXAM ===');
  let totalDupes = 0;
  for (const exam of exams) {
    const urls = exam.images.map(i => i.url);
    const uniqueUrls = new Set(urls);
    if (urls.length !== uniqueUrls.size) {
      const dupes = urls.length - uniqueUrls.size;
      totalDupes += dupes;
      console.log(`  ${exam.patient.name} exam ${exam.id.substring(0, 16)}... : ${dupes} duplicate URLs`);
    }
  }
  console.log(`Total duplicate image URLs: ${totalDupes}`);

  await prisma.$disconnect();
}

main().catch(console.error);
