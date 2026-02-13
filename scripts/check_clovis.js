const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const pat = await p.patient.findUnique({
    where: { id: '697001cc26260539c16a960f' },
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
  const patNorm = pat.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const exam of pat.exams) {
    console.log(`\nExam: ${exam.id} - ${exam.images.length} images`);
    for (const img of exam.images) {
      let owner = '?';
      if (img.url) {
        try {
          const url = decodeURIComponent(img.url);
          const m = url.match(/\/patients\/(.+?)_[a-f0-9]{8,24}\//i);
          if (m) owner = m[1].replace(/_/g, ' ');
        } catch(e) {}
      }
      const isRight = owner.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('CLOVIS');
      console.log(`  [${exam.images.indexOf(img)}] ${img.id} (${img.type || '?'}) -> ${owner} ${isRight ? '✅' : '❌'}`);
    }
    if (exam.report) {
      console.log(`  Report selectedImages: ${JSON.stringify(exam.report.selectedImages)}`);
    }
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
