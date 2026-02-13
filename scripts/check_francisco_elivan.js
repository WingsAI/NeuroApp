const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  // Check FRANCISCO ELIVAN - has 2 exams?
  const pat = await p.patient.findFirst({
    where: { name: { contains: 'FRANCISCO ELIVAN', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: { select: { id: true, selectedImages: true } }
        }
      }
    }
  });

  if (!pat) { console.log('Not found'); await p.$disconnect(); return; }

  console.log(`Patient: ${pat.name} (ID: ${pat.id})`);
  for (const exam of pat.exams) {
    console.log(`\nExam: ${exam.id} (eyerCloud: ${exam.eyerCloudId}) - ${exam.images.length} images`);
    exam.images.forEach((img, i) => console.log(`  [${i}] ${img.id} (${img.type})`));
    if (exam.report) {
      console.log(`  Report: ${JSON.stringify(exam.report.selectedImages)}`);
      // Check if selectedImages resolve
      const si = exam.report.selectedImages;
      const ids = new Set(exam.images.map(i => i.id));
      if (si) {
        for (const eye of ['od', 'oe']) {
          if (si[eye]) {
            console.log(`    ${eye}: ${si[eye]} -> ${ids.has(si[eye]) ? '✅' : '❌ NOT FOUND'}`);
          }
        }
      }
    }
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
