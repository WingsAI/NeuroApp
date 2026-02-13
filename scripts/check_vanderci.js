const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'VANDERCI', mode: 'insensitive' } },
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
        console.log('Selected Images (raw):', JSON.stringify(exam.report.selectedImages));
        console.log('Diagnosis:', exam.report.diagnosis?.substring(0, 200));
        console.log('Findings:', exam.report.findings?.substring(0, 200));

        // Parse selectedImages
        let selectedIds;
        const si = exam.report.selectedImages;
        if (si && typeof si === 'object') {
          selectedIds = Object.values(si);
        } else if (typeof si === 'string') {
          try { selectedIds = Object.values(JSON.parse(si)); } catch { selectedIds = [si]; }
        }

        if (selectedIds) {
          console.log('\nParsed selected IDs:', selectedIds);
          const examImageIds = exam.images.map(i => i.id);
          for (const sid of selectedIds) {
            const found = examImageIds.includes(sid);
            console.log(`  "${sid}" -> ${found ? 'FOUND' : 'MISSING'} in exam images`);
            if (!found) {
              // Check if it's an old-style index reference
              const indexMatch = sid.match(/-(\d+)$/);
              if (indexMatch) {
                const idx = parseInt(indexMatch[1]);
                console.log(`    Old-style index: ${idx}, exam has ${exam.images.length} images`);
                if (idx < exam.images.length) {
                  console.log(`    Would resolve to: ${examImageIds[idx]} (${exam.images[idx].type})`);
                } else {
                  console.log(`    Index ${idx} OUT OF RANGE (max: ${exam.images.length - 1})`);
                }
              }
            }
          }
        }
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
