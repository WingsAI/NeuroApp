/**
 * resolve_cml_ids.js - Resolve CML image IDs in selectedImages
 *
 * CML IDs (cmkv7..., cmlb6...) were created when doctors selected images from
 * CML duplicate exams. Those CML exams have been consolidated, but the report
 * selectedImages still reference the old CML image IDs.
 *
 * Strategy: For each CML ID in selectedImages, find which image index it
 * corresponded to in the CML exam, then map to the same index in the current exam.
 *
 * Since CML exams were duplicates of EyerCloud exams (same images, same order),
 * we can try to find the CML image in any CML exam for the same patient and
 * use its position to resolve.
 *
 * Usage:
 *   node scripts/resolve_cml_ids.js              # Preview
 *   node scripts/resolve_cml_ids.js --execute    # Apply
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

  // Get ALL images in the system (including CML exams) indexed by ID
  const allImages = await prisma.examImage.findMany({
    select: { id: true, examId: true }
  });
  const imageById = {};
  for (const img of allImages) {
    imageById[img.id] = img;
  }

  // Get all exams with images, grouped by patient
  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  let fixed = 0;
  let skippedLocked = 0;
  let unresolvable = 0;
  let alreadyOk = 0;

  for (const pat of patients) {
    for (const exam of pat.exams) {
      if (!exam.report || !exam.report.selectedImages) continue;

      const si = exam.report.selectedImages;
      if (typeof si !== 'object' || Array.isArray(si)) continue;

      const examImageIds = new Set(exam.images.map(i => i.id));
      let needsUpdate = false;
      const newMap = { ...si };

      for (const eye of ['od', 'oe']) {
        const cmlId = si[eye];
        if (!cmlId) continue;
        if (examImageIds.has(cmlId)) continue; // Already resolved

        // Check if this is a CML ID
        if (!cmlId.startsWith('cm')) continue;

        // Strategy 1: Find the CML image in the system and get its position in its exam
        const cmlImage = imageById[cmlId];
        if (cmlImage) {
          // Find the CML exam's images to get the index
          const cmlExam = pat.exams.find(e => e.id === cmlImage.examId);
          if (cmlExam) {
            const cmlExamImages = cmlExam.images;
            const cmlIndex = cmlExamImages.findIndex(i => i.id === cmlId);
            if (cmlIndex >= 0 && cmlIndex < exam.images.length) {
              newMap[eye] = exam.images[cmlIndex].id;
              needsUpdate = true;
              continue;
            }
          }
        }

        // Strategy 2: CML image no longer exists in system (was deleted during consolidation)
        // Find any CML exam for this patient that has images starting with 'cm'
        let resolved = false;
        for (const otherExam of pat.exams) {
          if (otherExam.id === exam.id) continue;
          const cmlImages = otherExam.images.filter(i => i.id.startsWith('cm'));
          if (cmlImages.length === 0) continue;

          // Check if the CML ID pattern matches this exam's CML images
          // CML images should have similar prefix patterns
          const idx = cmlImages.findIndex(i => i.id === cmlId);
          if (idx >= 0 && idx < exam.images.length) {
            newMap[eye] = exam.images[idx].id;
            needsUpdate = true;
            resolved = true;
            break;
          }
        }
        if (resolved) continue;

        // Strategy 3: Since CML exams are duplicates, images are in the same order
        // We know CML exams have the same images as the original.
        // Try to match by looking at ALL CML images for this patient,
        // sort them by ID, find the position of our target ID, and map to same position
        const allCmlImagesForPatient = [];
        for (const otherExam of pat.exams) {
          for (const img of otherExam.images) {
            if (img.id.startsWith('cm')) {
              allCmlImagesForPatient.push({ id: img.id, examId: otherExam.id });
            }
          }
        }

        // Group CML images by exam
        const cmlByExam = {};
        for (const ci of allCmlImagesForPatient) {
          if (!cmlByExam[ci.examId]) cmlByExam[ci.examId] = [];
          cmlByExam[ci.examId].push(ci.id);
        }

        // For each CML exam, check if our target ID would be there
        for (const [cmlExamId, cmlIds] of Object.entries(cmlByExam)) {
          cmlIds.sort(); // Sort CML IDs to establish order
          const idx = cmlIds.indexOf(cmlId);
          if (idx >= 0 && idx < exam.images.length) {
            newMap[eye] = exam.images[idx].id;
            needsUpdate = true;
            resolved = true;
            break;
          }
        }
        if (resolved) continue;

        // If none of the strategies work, we can't resolve
        // But we know both exams had the same images (CML is duplicate of EyerCloud)
        // The CML images were deleted. We need a different approach.
        // Since we can't find the CML image, we can't determine the index.
        // Mark as unresolvable.
      }

      if (!needsUpdate) {
        // Check if still has CML IDs (unresolvable)
        let hasCml = false;
        for (const eye of ['od', 'oe']) {
          if (newMap[eye] && newMap[eye].startsWith('cm') && !examImageIds.has(newMap[eye])) {
            hasCml = true;
          }
        }
        if (hasCml) unresolvable++;
        else alreadyOk++;
        continue;
      }

      // Check if still has unresolved CML IDs after partial fix
      let stillHasCml = false;
      for (const eye of ['od', 'oe']) {
        if (newMap[eye] && newMap[eye].startsWith('cm') && !examImageIds.has(newMap[eye])) {
          stillHasCml = true;
        }
      }

      if (isLocked(pat.name)) {
        console.log(`  SKIP (LOCKED): ${pat.name} - ${exam.id}`);
        skippedLocked++;
        continue;
      }

      console.log(`  FIX: ${pat.name} (${exam.id})`);
      console.log(`    old: ${JSON.stringify(si)}`);
      console.log(`    new: ${JSON.stringify(newMap)}`);
      if (stillHasCml) console.log(`    WARNING: Still has unresolved CML IDs`);
      fixed++;

      if (EXECUTE) {
        await prisma.medicalReport.update({
          where: { id: exam.report.id },
          data: { selectedImages: newMap }
        });
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Locked (skipped): ${skippedLocked}`);
  console.log(`Unresolvable: ${unresolvable}`);
  console.log(`Already OK: ${alreadyOk}`);

  if (!EXECUTE && fixed > 0) {
    console.log(`\nRun with --execute to apply changes.`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
