/**
 * fix_missing_mapped_images.js - Import images from Bytescale mapping that are missing in DB
 *
 * Uses image_types.json to:
 * 1. Determine real image type (COLOR/ANTERIOR) instead of trusting mapping type (UNKNOWN)
 * 2. Skip REDFREE images (never import them)
 *
 * Usage:
 *   node scripts/fix_missing_mapped_images.js              # Preview
 *   node scripts/fix_missing_mapped_images.js --execute     # Apply
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const PREVIEW = !process.argv.includes('--execute');

async function fixMissingImages() {
  console.log('=== Fix Missing Mapped Images ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  // Load image_types.json for real types
  const typesPath = path.join(__dirname, 'eyercloud_downloader', 'image_types.json');
  const imageTypesRaw = JSON.parse(fs.readFileSync(typesPath, 'utf8'));

  // Support both flat {uuid: type} and nested {examId: {uuid: type}} formats
  const uuidToType = {};
  const firstValue = Object.values(imageTypesRaw)[0];
  if (typeof firstValue === 'string') {
    Object.assign(uuidToType, imageTypesRaw);
  } else {
    for (const types of Object.values(imageTypesRaw)) {
      for (const [uuid, type] of Object.entries(types)) {
        uuidToType[uuid] = type;
      }
    }
  }
  console.log(`Loaded ${Object.keys(uuidToType).length} image types from image_types.json\n`);

  try {
    const patients = await prisma.patient.findMany({
      include: {
        exams: {
          include: {
            images: true
          }
        }
      }
    });

    // Build mapping by exam_id - handle both short and full IDs
    const mappingByExamId = {};
    const mappingByShortId = {}; // short ID -> array of entries (can collide!)
    const mappingByName = {}; // normalized patient name -> array of entries
    Object.values(mapping).forEach(entry => {
      if (entry.exam_id && entry.images) {
        mappingByExamId[entry.exam_id] = entry;
        // Index by first 8 chars (may have collisions)
        if (entry.exam_id.length >= 8) {
          const short = entry.exam_id.substring(0, 8);
          if (!mappingByShortId[short]) mappingByShortId[short] = [];
          mappingByShortId[short].push(entry);
        }
        // Index by normalized patient name
        if (entry.patient_name) {
          const normName = entry.patient_name.toUpperCase().trim();
          if (!mappingByName[normName]) mappingByName[normName] = [];
          mappingByName[normName].push(entry);
        }
      }
    });

    let totalExamsChecked = 0;
    let totalExamsWithMissingImages = 0;
    let totalImagesMissing = 0;
    let totalImagesAdded = 0;
    let totalRedfreeSkipped = 0;
    let totalUnknownTypeSkipped = 0;

    for (const patient of patients) {
      for (const exam of patient.exams) {
        if (!exam.eyerCloudId || exam.eyerCloudId.startsWith('cml')) continue;

        totalExamsChecked++;

        // Try to find mapping entry by full ID, then short ID (with name disambiguation), then name
        let mappingEntry = mappingByExamId[exam.eyerCloudId];
        if (!mappingEntry) {
          const shortEntries = mappingByShortId[exam.eyerCloudId.substring(0, 8)] || [];
          if (shortEntries.length === 1) {
            mappingEntry = shortEntries[0];
          } else if (shortEntries.length > 1) {
            // Multiple entries with same short ID - disambiguate by patient name
            const normPatientName = patient.name.toUpperCase().trim();
            mappingEntry = shortEntries.find(e =>
              e.patient_name && e.patient_name.toUpperCase().trim() === normPatientName
            );
          }
        }
        if (!mappingEntry) {
          // Fallback: match by patient name
          const normPatientName = patient.name.toUpperCase().trim();
          const nameEntries = mappingByName[normPatientName] || [];
          if (nameEntries.length === 1) {
            mappingEntry = nameEntries[0];
          }
        }
        if (!mappingEntry) continue;

        const mappingImages = mappingEntry.images || [];

        // Create a set of existing image URLs in DB
        const dbImageUrls = new Set(exam.images.map(img => img.url));

        // Find images in mapping that are not in DB, filtering out REDFREE
        const missingImages = [];
        let examRedfreeSkipped = 0;
        let examUnknownSkipped = 0;

        for (const mappingImg of mappingImages) {
          if (dbImageUrls.has(mappingImg.bytescale_url)) continue; // Already in DB

          // Get UUID from filename
          const uuid = (mappingImg.filename || '').replace(/\.(jpg|jpeg|png)$/i, '');

          // Look up real type from image_types.json
          const realType = uuidToType[uuid];

          if (realType === 'REDFREE') {
            examRedfreeSkipped++;
            totalRedfreeSkipped++;
            continue; // Never import REDFREE
          }

          if (!realType) {
            // Unknown type - skip to be safe (could be REDFREE)
            examUnknownSkipped++;
            totalUnknownTypeSkipped++;
            continue;
          }

          missingImages.push({ ...mappingImg, realType, uuid });
        }

        if (missingImages.length > 0) {
          totalExamsWithMissingImages++;
          totalImagesMissing += missingImages.length;

          console.log(`\nPatient: ${patient.name}`);
          console.log(`  Exam: ${exam.id} (${exam.eyerCloudId})`);
          console.log(`  DB images: ${exam.images.length}, Mapping images: ${mappingImages.length}`);
          console.log(`  Missing (COLOR/ANTERIOR): ${missingImages.length}` +
            (examRedfreeSkipped > 0 ? `, REDFREE skipped: ${examRedfreeSkipped}` : '') +
            (examUnknownSkipped > 0 ? `, Unknown skipped: ${examUnknownSkipped}` : ''));

          if (!PREVIEW) {
            // Add missing images in batch
            const createData = missingImages.map((img, i) => ({
              id: `img-${crypto.randomUUID()}.jpg`,
              examId: exam.id,
              url: img.bytescale_url,
              fileName: img.filename || `image-${i}.jpg`,
              type: img.realType,
            }));

            for (const data of createData) {
              await prisma.examImage.create({ data });
              totalImagesAdded++;
            }
            console.log(`    ✓ Added ${createData.length} images`);
          } else {
            for (const img of missingImages) {
              console.log(`    - Would add: ${img.uuid} (${img.realType})`);
            }
          }
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total exams checked: ${totalExamsChecked}`);
    console.log(`Exams with missing images: ${totalExamsWithMissingImages}`);
    console.log(`Total images to add (COLOR/ANTERIOR): ${totalImagesMissing}`);
    console.log(`REDFREE skipped: ${totalRedfreeSkipped}`);
    console.log(`Unknown type skipped: ${totalUnknownTypeSkipped}`);

    if (!PREVIEW) {
      console.log(`Total images added: ${totalImagesAdded}`);
    } else {
      console.log('\nRun with --execute to apply changes');
    }

    // Final counts
    const finalImages = await prisma.examImage.count();
    console.log(`\nDB images: ${finalImages}`);

  } finally {
    await prisma.$disconnect();
  }
}

fixMissingImages().catch(console.error);
