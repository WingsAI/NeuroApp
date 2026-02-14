/**
 * migrate_image_ids.js - Migrate old-format image IDs to img-UUID.jpg format
 *
 * Old format: examId-N (e.g., "697001ce4e429636ed944c10-5")
 *   - Uses mapping file index, includes REDFREE gaps
 *   - String sort causes -11 before -2 → wrong index resolution
 *   - No semantic meaning
 *
 * New format: img-{UUID}.jpg (e.g., "img-fa3f5498-ad73-4bd8-a530-b758e9f50580.jpg")
 *   - UUID from the actual Bytescale filename
 *   - Globally unique, no collisions
 *   - Immutable across reimports
 *
 * ID-ONLY RENAME: This script ONLY renames image IDs.
 *   It does NOT change any patient data, image URLs, image files,
 *   or report content. The Bytescale URL stays identical.
 *   Safe for all patients including those manually corrected by the doctor.
 *
 * Usage:
 *   node scripts/migrate_image_ids.js              # Preview
 *   node scripts/migrate_image_ids.js --execute    # Apply
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

// Check if image ID is old format (examId-N or CML IDs like cmlb6..., cml8t...)
function isOldFormat(id) {
  if (/^[a-f0-9]{24}-\d+$/.test(id)) return true;  // examId-N
  if (/^cm[lk][a-z0-9]/.test(id)) return true;       // CML/CMK format
  return false;
}

// Extract UUID filename from Bytescale URL
function extractUUID(url) {
  if (!url) return null;
  try {
    const decoded = decodeURIComponent(url);
    const filename = decoded.split('/').pop()?.split('?')[0];
    if (filename && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.jpg$/i.test(filename)) {
      return filename;
    }
    // Try without extension
    if (filename && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(filename)) {
      return filename + '.jpg';
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: true,
          report: { select: { id: true, selectedImages: true } }
        }
      }
    }
  });

  let imagesRenamed = 0;
  let reportsUpdated = 0;
  let historyEntries = 0;
  let skippedNoUrl = 0;
  let skippedAlreadyNew = 0;
  let duplicatesRemoved = 0;

  for (const pat of patients) {
    for (const exam of pat.exams) {
      // Build rename map for this exam: oldId -> newId
      const renameMap = {};
      let hasOldFormat = false;

      for (const img of exam.images) {
        if (!isOldFormat(img.id)) {
          skippedAlreadyNew++;
          continue;
        }

        hasOldFormat = true;
        const uuid = extractUUID(img.url);
        if (!uuid) {
          skippedNoUrl++;
          continue;
        }

        const newId = `img-${uuid}`;
        renameMap[img.id] = newId;
      }

      if (!hasOldFormat) continue;

      // Log renames for this exam
      if (Object.keys(renameMap).length > 0) {
        console.log(`\n${pat.name} (exam ${exam.id}):`);
        for (const [oldId, newId] of Object.entries(renameMap)) {
          console.log(`  ${oldId} → ${newId}`);
          imagesRenamed++;
        }
      }

      // Check if report selectedImages references old IDs
      if (exam.report?.selectedImages && typeof exam.report.selectedImages === 'object') {
        const si = exam.report.selectedImages;
        const newSi = { ...si };
        let siChanged = false;

        for (const eye of ['od', 'oe']) {
          if (si[eye] && renameMap[si[eye]]) {
            newSi[eye] = renameMap[si[eye]];
            siChanged = true;
          }
        }

        if (siChanged) {
          console.log(`  Report: ${JSON.stringify(si)} → ${JSON.stringify(newSi)}`);
          reportsUpdated++;

          if (EXECUTE) {
            // Update report selectedImages
            await prisma.medicalReport.update({
              where: { id: exam.report.id },
              data: { selectedImages: newSi }
            });

            // Log to history
            await prisma.selectedImagesHistory.create({
              data: {
                reportId: exam.report.id,
                previousImages: si,
                newImages: newSi,
                changedBy: 'script:migrate_image_ids.js',
                reason: 'ID format migration: examId-N → img-UUID.jpg'
              }
            });
            historyEntries++;
          }
        }
      }

      // Execute image renames
      if (EXECUTE) {
        for (const [oldId, newId] of Object.entries(renameMap)) {
          // Check if newId already exists (duplicate image from earlier import)
          const existing = await prisma.examImage.findUnique({ where: { id: newId } });
          if (existing) {
            // New ID already exists - delete the old-format duplicate
            await prisma.examImage.delete({ where: { id: oldId } });
            duplicatesRemoved++;
          } else {
            // Rename: update primary key via raw SQL
            await prisma.$executeRawUnsafe(
              `UPDATE "ExamImage" SET id = $1 WHERE id = $2`,
              newId, oldId
            );
          }
        }
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Images renamed: ${imagesRenamed}`);
  console.log(`Reports updated: ${reportsUpdated}`);
  console.log(`History entries: ${historyEntries}`);
  console.log(`Skipped (no URL/UUID): ${skippedNoUrl}`);
  console.log(`Skipped (already new format): ${skippedAlreadyNew}`);
  console.log(`Duplicates removed: ${duplicatesRemoved}`);

  if (!EXECUTE && imagesRenamed > 0) {
    console.log(`\nRun with --execute to apply changes.`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
