/**
 * fix_cml_selected_images.js - Clean up unresolvable CML IDs in selectedImages
 *
 * CML IDs (cmkv7..., cmlb6...) referenced images from deleted CML duplicate exams.
 * These images no longer exist and can't be resolved. Set them to null so the UI
 * shows "no image selected" instead of a broken reference.
 *
 * Also fixes the 2 locked ANTONIA PAULA PEREIRA DE OLIVEIRA reports that have
 * resolvable old-format IDs (examId-N).
 *
 * Usage:
 *   node scripts/fix_cml_selected_images.js              # Preview
 *   node scripts/fix_cml_selected_images.js --execute     # Apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

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
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const exams = await prisma.exam.findMany({
    where: { report: { isNot: null } },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: { select: { id: true, selectedImages: true } },
      patient: { select: { name: true } }
    }
  });

  let cmlNulled = 0;
  let lockedFixed = 0;
  let alreadyOk = 0;

  for (const exam of exams) {
    const si = exam.report.selectedImages;
    if (!si || typeof si !== 'object') continue;

    const examImageIds = new Set(exam.images.map(i => i.id));
    let needsUpdate = false;
    const newMap = { ...si };
    const locked = isLocked(exam.patient.name);

    for (const eye of ['od', 'oe']) {
      const id = si[eye];
      if (!id) continue;
      if (examImageIds.has(id)) continue; // Already OK

      if (id.startsWith('cm') && !id.match(/-\d+$/)) {
        // CML ID without index - unresolvable, null it
        newMap[eye] = null;
        needsUpdate = true;
      } else {
        // Old format with -N suffix (including locked patients)
        const indexMatch = id.match(/-(\d+)$/);
        if (indexMatch) {
          const idx = parseInt(indexMatch[1]);
          if (idx < exam.images.length) {
            newMap[eye] = exam.images[idx].id;
            needsUpdate = true;
          } else {
            // Out of range - null it
            newMap[eye] = null;
            needsUpdate = true;
          }
        }
      }
    }

    if (!needsUpdate) {
      alreadyOk++;
      continue;
    }

    const isCml = Object.values(si).some(v => v && typeof v === 'string' && v.startsWith('cm'));

    if (isCml) {
      console.log(`  NULL CML: ${exam.patient.name} (${exam.id})`);
      console.log(`    old: ${JSON.stringify(si)}`);
      console.log(`    new: ${JSON.stringify(newMap)}`);
      cmlNulled++;
    } else if (locked) {
      console.log(`  FIX LOCKED: ${exam.patient.name} (${exam.id})`);
      console.log(`    old: ${JSON.stringify(si)}`);
      console.log(`    new: ${JSON.stringify(newMap)}`);
      lockedFixed++;
    }

    if (EXECUTE) {
      await prisma.medicalReport.update({
        where: { id: exam.report.id },
        data: { selectedImages: newMap }
      });
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`CML IDs nulled: ${cmlNulled}`);
  console.log(`Locked reports fixed: ${lockedFixed}`);
  console.log(`Already OK: ${alreadyOk}`);

  if (!EXECUTE && (cmlNulled + lockedFixed > 0)) {
    console.log(`\nRun with --execute to apply changes.`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
