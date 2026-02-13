const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const exams = await prisma.exam.findMany({
    where: { report: { isNot: null } },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: { select: { id: true, selectedImages: true } },
      patient: { select: { name: true } }
    }
  });

  console.log(`Exams with reports: ${exams.length}\n`);

  let brokenCount = 0;
  let okCount = 0;
  let noSelectedCount = 0;
  let outOfRangeCount = 0;
  const brokenExams = [];

  for (const exam of exams) {
    const si = exam.report.selectedImages;
    if (!si) { noSelectedCount++; continue; }

    // Parse selectedImages - could be object {od, oe} or string
    let selectedIds = [];
    if (typeof si === 'object' && !Array.isArray(si)) {
      selectedIds = Object.entries(si).map(([eye, id]) => ({ eye, id }));
    } else if (typeof si === 'string') {
      try {
        const parsed = JSON.parse(si);
        if (typeof parsed === 'object') {
          selectedIds = Object.entries(parsed).map(([eye, id]) => ({ eye, id }));
        }
      } catch {
        selectedIds = [{ eye: '?', id: si }];
      }
    }

    const examImageIds = new Set(exam.images.map(i => i.id));
    let hasBroken = false;
    const details = [];

    for (const { eye, id } of selectedIds) {
      if (!id) continue;
      if (examImageIds.has(id)) {
        details.push({ eye, id, status: 'OK' });
      } else {
        hasBroken = true;
        // Check if index-based resolution works
        const indexMatch = id.match(/-(\d+)$/);
        if (indexMatch) {
          const idx = parseInt(indexMatch[1]);
          if (idx < exam.images.length) {
            details.push({ eye, id, status: 'RESOLVABLE', resolvedTo: exam.images[idx].id, index: idx });
          } else {
            details.push({ eye, id, status: 'OUT_OF_RANGE', index: idx, maxIndex: exam.images.length - 1 });
            outOfRangeCount++;
          }
        } else {
          details.push({ eye, id, status: 'BROKEN_NO_INDEX' });
        }
      }
    }

    if (hasBroken) {
      brokenCount++;
      brokenExams.push({ patient: exam.patient.name, examId: exam.id, details, imageCount: exam.images.length });
    } else {
      okCount++;
    }
  }

  console.log(`=== SUMMARY ===`);
  console.log(`Reports OK (selectedImages match): ${okCount}`);
  console.log(`Reports BROKEN (selectedImages don't match): ${brokenCount}`);
  console.log(`Reports with no selectedImages: ${noSelectedCount}`);
  console.log(`Total out-of-range indexes: ${outOfRangeCount}`);

  console.log(`\n=== BROKEN REPORTS DETAIL ===`);
  for (const be of brokenExams) {
    console.log(`\n${be.patient} (exam: ${be.examId}, ${be.imageCount} images):`);
    for (const d of be.details) {
      if (d.status === 'RESOLVABLE') {
        console.log(`  ${d.eye}: "${d.id}" -> index ${d.index} -> ${d.resolvedTo} [RESOLVABLE]`);
      } else if (d.status === 'OUT_OF_RANGE') {
        console.log(`  ${d.eye}: "${d.id}" -> index ${d.index} OUT OF RANGE (max: ${d.maxIndex}) [BROKEN]`);
      } else if (d.status === 'BROKEN_NO_INDEX') {
        console.log(`  ${d.eye}: "${d.id}" [BROKEN - no index pattern]`);
      } else {
        console.log(`  ${d.eye}: "${d.id}" [OK]`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
