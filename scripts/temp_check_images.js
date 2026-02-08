const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // Check a report's selectedImages vs exam images
  const reports = await db.medicalReport.findMany({
    where: { selectedImages: { not: null } },
    take: 5,
    include: {
      exam: {
        include: {
          images: { take: 3, select: { id: true, url: true } },
          patient: { select: { name: true } }
        }
      }
    }
  });

  for (const r of reports) {
    console.log(`\n${r.exam.patient.name}:`);
    console.log('  selectedImages:', JSON.stringify(r.selectedImages));
    console.log('  exam image IDs:', r.exam.images.map(i => i.id));
    console.log('  exam image URLs:', r.exam.images.map(i => i.url?.substring(0, 50)));
  }

  // Also check: how many exams have images?
  const examsWithImages = await db.exam.count({ where: { images: { some: {} } } });
  const examsWithReports = await db.exam.count({ where: { report: { isNot: null } } });
  const completedWithImages = await db.exam.count({ where: { status: 'completed', images: { some: {} } } });
  const completedNoImages = await db.exam.count({ where: { status: 'completed', images: { none: {} } } });

  console.log('\n--- Stats ---');
  console.log('Exams with images:', examsWithImages);
  console.log('Exams with reports:', examsWithReports);
  console.log('Completed with images:', completedWithImages);
  console.log('Completed WITHOUT images:', completedNoImages);

  await db.$disconnect();
}
main();
