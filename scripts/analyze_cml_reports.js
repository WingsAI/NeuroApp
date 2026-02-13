/**
 * Analyze the 28 CML-ID reports to understand the relationship between
 * the CML IDs and the current exam images.
 *
 * For each report with CML IDs:
 * 1. Find if the patient has a CML duplicate exam
 * 2. Check if CML images still exist
 * 3. Try to determine what the doctor actually selected
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const exams = await prisma.exam.findMany({
    where: { report: { isNot: null } },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: { select: { id: true, selectedImages: true } },
      patient: {
        include: {
          exams: {
            include: {
              images: { orderBy: { id: 'asc' } }
            }
          }
        }
      }
    }
  });

  console.log('=== CML ID ANALYSIS ===\n');

  let count = 0;
  for (const exam of exams) {
    const si = exam.report.selectedImages;
    if (!si || typeof si !== 'object') continue;

    const examImageIds = new Set(exam.images.map(i => i.id));
    let hasCml = false;

    for (const eye of ['od', 'oe']) {
      if (si[eye] && si[eye].startsWith('cm') && !examImageIds.has(si[eye])) {
        hasCml = true;
        break;
      }
    }
    if (!hasCml) continue;

    count++;
    console.log(`\n--- ${exam.patient.name} ---`);
    console.log(`Report exam: ${exam.id} (${exam.images.length} images)`);
    console.log(`selectedImages: ${JSON.stringify(si)}`);

    // Show this exam's images
    console.log(`Current images:`);
    exam.images.forEach((img, i) => console.log(`  [${i}] ${img.id} (${img.type || '?'})`));

    // Show all patient exams
    const otherExams = exam.patient.exams.filter(e => e.id !== exam.id);
    if (otherExams.length > 0) {
      console.log(`Other exams for this patient:`);
      for (const oe of otherExams) {
        console.log(`  ${oe.id} (${oe.images.length} images, eyerCloud: ${oe.eyerCloudId || 'null'})`);
        oe.images.forEach((img, i) => console.log(`    [${i}] ${img.id} (${img.type || '?'})`));
      }
    } else {
      console.log(`No other exams for this patient.`);
    }

    // Analyze: which eye has CML and which has resolved?
    for (const eye of ['od', 'oe']) {
      const id = si[eye];
      if (!id) continue;
      if (examImageIds.has(id)) {
        console.log(`${eye}: ${id} -> RESOLVED (exists in exam)`);
      } else if (id.startsWith('cm')) {
        console.log(`${eye}: ${id} -> CML ID (not in exam)`);
      } else {
        console.log(`${eye}: ${id} -> OTHER (not in exam)`);
      }
    }
  }

  console.log(`\n\nTotal reports with CML IDs: ${count}`);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
