const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function main() {
  // For each broken report, find which image index was selected
  // and map it to the actual image ID at that index
  const exams = await db.exam.findMany({
    where: {
      status: 'completed',
      report: { isNot: null },
    },
    include: {
      images: { orderBy: { uploadedAt: 'asc' } },
      report: { select: { id: true, selectedImages: true } },
      patient: { select: { name: true, exams: { select: { id: true, images: { select: { id: true }, orderBy: { uploadedAt: 'asc' } } } } } },
    },
  });

  let fixable = 0;
  let unfixable = 0;
  const fixes = [];

  for (const exam of exams) {
    const sel = exam.report?.selectedImages;
    if (!sel || typeof sel !== 'object') continue;

    const imageIds = new Set(exam.images.map(i => i.id));
    const odId = sel.od;
    const oeId = sel.oe;
    const odMissing = odId && !imageIds.has(odId);
    const oeMissing = oeId && !imageIds.has(oeId);

    if (!odMissing && !oeMissing) continue;

    // Try to find the image by index from the selectedImage ID
    // Format: examId-N or cml...-N
    let newOd = odId;
    let newOe = oeId;

    // Check if the selected image is from another exam (CML duplicate)
    const allPatientImages = [];
    for (const pExam of exam.patient.exams) {
      for (const img of pExam.images) {
        allPatientImages.push(img.id);
      }
    }

    if (odMissing) {
      // Try to find in other exams of the same patient
      if (allPatientImages.includes(odId)) {
        // It's from another exam - just use it
        newOd = odId;
      } else {
        // Extract index from ID format "prefix-N"
        const match = odId?.match(/-(\d+)$/);
        if (match) {
          const idx = parseInt(match[1]);
          if (idx < exam.images.length) {
            newOd = exam.images[idx].id;
          }
        }
      }
    }

    if (oeMissing) {
      if (allPatientImages.includes(oeId)) {
        newOe = oeId;
      } else {
        const match = oeId?.match(/-(\d+)$/);
        if (match) {
          const idx = parseInt(match[1]);
          if (idx < exam.images.length) {
            newOe = exam.images[idx].id;
          }
        }
      }
    }

    const odFixed = !odMissing || newOd !== odId;
    const oeFixed = !oeMissing || newOe !== oeId;

    if (odFixed && oeFixed) {
      fixable++;
      fixes.push({
        reportId: exam.report.id,
        name: exam.patient.name,
        oldOd: odId,
        oldOe: oeId,
        newOd,
        newOe,
      });
    } else {
      unfixable++;
      console.log(`  UNFIXABLE: ${exam.patient.name} od=${odId} oe=${oeId}`);
    }
  }

  console.log(`\nFixable: ${fixable}`);
  console.log(`Unfixable: ${unfixable}`);
  console.log(`\nSample fixes:`);
  fixes.slice(0, 5).forEach(f => {
    console.log(`  ${f.name}:`);
    console.log(`    OD: ${f.oldOd} -> ${f.newOd}`);
    console.log(`    OE: ${f.oldOe} -> ${f.newOe}`);
  });

  await db.$disconnect();
}
main();
