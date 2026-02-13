const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const patients = await p.patient.findMany({ select: { name: true, id: true } });

  // Search for any CLOVIS or TORQUATO variant
  const matches = patients.filter(pat =>
    pat.name.toUpperCase().includes('CLOVI') ||
    pat.name.toUpperCase().includes('TORQUATO')
  );
  console.log('CLOVIS/TORQUATO matches:');
  matches.forEach(m => console.log('  ' + m.name + ' (ID: ' + m.id + ')'));

  if (matches.length === 0) {
    // Try ALVIS as alternate search
    const alvis = patients.filter(pat => pat.name.toUpperCase().includes('ALVIS') || pat.name.toUpperCase().includes('ALVES'));
    console.log('\nALVIS/ALVES matches (first 10):');
    alvis.slice(0, 10).forEach(m => console.log('  ' + m.name));
    console.log('  ... total: ' + alvis.length);
  }

  // Check the 3 remaining patients
  const checkIds = ['697001c826260539c16a960a', '697001cc4e429636ed944c0e', '695ea2b84b0e754dac369600'];
  for (const id of checkIds) {
    const pat = await p.patient.findUnique({
      where: { id },
      include: {
        exams: {
          include: {
            images: { orderBy: { id: 'asc' } },
            report: { select: { id: true, selectedImages: true } }
          }
        }
      }
    });
    if (pat) {
      console.log(`\n--- ${pat.name} ---`);
      for (const exam of pat.exams) {
        console.log(`  Exam: ${exam.id} - ${exam.images.length} images`);
        const patNorm = pat.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        let wrong = 0, right = 0;
        for (const img of exam.images) {
          if (!img.url) continue;
          try {
            const url = decodeURIComponent(img.url);
            const m = url.match(/\/patients\/(.+?)_[a-f0-9]{8,24}\//i);
            if (m) {
              const urlName = m[1].replace(/_/g, ' ').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              if (urlName === patNorm || patNorm.includes(urlName) || urlName.includes(patNorm)) {
                right++;
              } else {
                wrong++;
                console.log(`    WRONG: ${img.id} -> ${m[1]}`);
              }
            } else right++;
          } catch(e) { right++; }
        }
        console.log(`    ${right} right, ${wrong} wrong`);
        if (exam.report) {
          console.log(`    selectedImages: ${JSON.stringify(exam.report.selectedImages)}`);
        }
      }
    }
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
