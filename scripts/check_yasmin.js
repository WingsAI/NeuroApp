const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'YASMIN', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  for (const pat of patients) {
    console.log('=== PATIENT ===');
    console.log('Name:', pat.name);
    console.log('ID:', pat.id);

    for (const exam of pat.exams) {
      console.log('\n--- EXAM ---');
      console.log('Exam ID:', exam.id);
      console.log('Status:', exam.status);
      console.log('Images:', exam.images.length);

      exam.images.forEach((img, i) => {
        console.log(`  ${i + 1}. id="${img.id}" type=${img.type} url=${img.url?.substring(0, 120)}`);
      });

      if (exam.report) {
        console.log('\n--- REPORT ---');
        console.log('Report ID:', exam.report.id);
        console.log('Right Eye:', exam.report.rightEye);
        console.log('Left Eye:', exam.report.leftEye);
        console.log('Selected Images:', exam.report.selectedImages);
        console.log('Notes:', exam.report.notes?.substring(0, 200));

        // Check if selectedImages reference existing image IDs
        if (exam.report.selectedImages) {
          let selectedIds;
          try {
            selectedIds = JSON.parse(exam.report.selectedImages);
          } catch {
            selectedIds = exam.report.selectedImages.split(',').map(s => s.trim());
          }

          console.log('\nSelected image IDs:', selectedIds);
          const examImageIds = exam.images.map(i => i.id);
          for (const sid of selectedIds) {
            const found = examImageIds.includes(sid);
            console.log(`  "${sid}" -> ${found ? 'FOUND' : 'MISSING'} in exam images`);
            if (!found) {
              // Try to find it by partial match
              const partial = examImageIds.find(eid => eid.includes(sid) || sid.includes(eid));
              if (partial) console.log(`    Partial match: "${partial}"`);
            }
          }
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
