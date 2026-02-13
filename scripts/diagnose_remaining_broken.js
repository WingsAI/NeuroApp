const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLocked(name) {
  const norm = normalize(name);
  return norm >= 'ADEMILSON' && norm < 'CESARD';
}

async function main() {
  const exams = await prisma.exam.findMany({
    where: { report: { isNot: null } },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: { select: { id: true, selectedImages: true } },
      patient: { select: { name: true } }
    }
  });

  let broken = 0;
  const categories = {
    locked: [],
    outOfRange: [],
    cmlNoIndex: [],
    oldFormatResolvable: [],
    nullValues: [],
    other: []
  };

  for (const exam of exams) {
    const si = exam.report.selectedImages;
    if (!si || typeof si !== 'object') continue;

    const imageIds = new Set(exam.images.map(i => i.id));
    let isBroken = false;
    const details = [];

    for (const eye of ['od', 'oe']) {
      const id = si[eye];
      if (!id) continue;
      if (imageIds.has(id)) continue;

      isBroken = true;
      const indexMatch = id.match(/-(\d+)$/);
      if (indexMatch) {
        const idx = parseInt(indexMatch[1]);
        if (idx < exam.images.length) {
          details.push({ eye, id, type: 'resolvable', resolvedTo: exam.images[idx].id, index: idx });
        } else {
          details.push({ eye, id, type: 'outOfRange', index: idx, max: exam.images.length - 1 });
        }
      } else if (id.startsWith('cm')) {
        details.push({ eye, id, type: 'cmlNoIndex' });
      } else {
        details.push({ eye, id, type: 'unknown' });
      }
    }

    if (!isBroken) continue;
    broken++;

    const locked = isLocked(exam.patient.name);
    const entry = {
      patient: exam.patient.name,
      examId: exam.id,
      si,
      imageCount: exam.images.length,
      locked,
      details
    };

    if (locked) {
      categories.locked.push(entry);
    } else {
      // Categorize by the worst detail type
      const types = details.map(d => d.type);
      if (types.includes('outOfRange')) categories.outOfRange.push(entry);
      else if (types.includes('cmlNoIndex')) categories.cmlNoIndex.push(entry);
      else if (types.includes('resolvable')) categories.oldFormatResolvable.push(entry);
      else categories.other.push(entry);
    }
  }

  console.log(`Total broken reports: ${broken}\n`);

  console.log(`=== LOCKED (skipped by fix script) ===  [${categories.locked.length}]`);
  for (const e of categories.locked) {
    console.log(`  ${e.patient} (${e.examId}): ${JSON.stringify(e.si)}`);
    e.details.forEach(d => console.log(`    ${d.eye}: ${d.id} -> ${d.type}${d.index !== undefined ? ` (idx ${d.index}, max ${d.max})` : ''}`));
  }

  console.log(`\n=== STILL RESOLVABLE (old format, should have been fixed) ===  [${categories.oldFormatResolvable.length}]`);
  for (const e of categories.oldFormatResolvable) {
    console.log(`  ${e.patient} (${e.examId}): ${JSON.stringify(e.si)}`);
    e.details.forEach(d => console.log(`    ${d.eye}: ${d.id} -> ${d.resolvedTo} (idx ${d.index})`));
  }

  console.log(`\n=== OUT OF RANGE (image lost) ===  [${categories.outOfRange.length}]`);
  for (const e of categories.outOfRange) {
    console.log(`  ${e.patient} (${e.examId}): ${JSON.stringify(e.si)} [${e.imageCount} images]`);
    e.details.forEach(d => console.log(`    ${d.eye}: ${d.id} -> ${d.type}${d.index !== undefined ? ` (idx ${d.index}, max ${d.max})` : ''}`));
  }

  console.log(`\n=== CML IDs (no index pattern) ===  [${categories.cmlNoIndex.length}]`);
  for (const e of categories.cmlNoIndex) {
    console.log(`  ${e.patient} (${e.examId}): ${JSON.stringify(e.si)} [${e.imageCount} images]`);
    e.details.forEach(d => console.log(`    ${d.eye}: ${d.id} -> ${d.type}`));
  }

  console.log(`\n=== OTHER ===  [${categories.other.length}]`);
  for (const e of categories.other) {
    console.log(`  ${e.patient} (${e.examId}): ${JSON.stringify(e.si)} [${e.imageCount} images]`);
    e.details.forEach(d => console.log(`    ${d.eye}: ${d.id} -> ${d.type}`));
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
