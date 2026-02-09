const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');
const crypto = require('crypto');

const PREVIEW = !process.argv.includes('--execute');

async function fixMissingImages() {
  console.log('=== Fix Missing Mapped Images ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

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

    const mappingByExamId = {};
    Object.values(mapping).forEach(entry => {
      if (entry.exam_id && entry.images) {
        mappingByExamId[entry.exam_id] = entry;
      }
    });

    let totalExamsChecked = 0;
    let totalExamsWithMissingImages = 0;
    let totalImagesMissing = 0;
    let totalImagesAdded = 0;

    for (const patient of patients) {
      for (const exam of patient.exams) {
        if (!exam.eyerCloudId || exam.eyerCloudId.startsWith('cml')) continue;

        totalExamsChecked++;
        const mappingEntry = mappingByExamId[exam.eyerCloudId];

        if (!mappingEntry) continue;

        const mappingImages = mappingEntry.images || [];

        // Create a set of existing image URLs in DB (since IDs may vary)
        const dbImageUrls = new Set(exam.images.map(img => img.url));

        // Find images in mapping that are not in DB
        const missingImages = mappingImages.filter(mappingImg => {
          return !dbImageUrls.has(mappingImg.bytescale_url);
        });

        if (missingImages.length > 0) {
          totalExamsWithMissingImages++;
          totalImagesMissing += missingImages.length;

          console.log(`\nPatient: ${patient.name}`);
          console.log(`  Exam: ${exam.id} (${exam.eyerCloudId})`);
          console.log(`  DB images: ${exam.images.length}, Mapping images: ${mappingImages.length}`);
          console.log(`  Missing: ${missingImages.length} images`);

          if (!PREVIEW) {
            // Add missing images
            for (let i = 0; i < missingImages.length; i++) {
              const mappingImg = missingImages[i];
              // Use img- + UUID as ID (same format as S3 uploads)
              const imageId = `img-${crypto.randomUUID()}.jpg`;

              await prisma.examImage.create({
                data: {
                  id: imageId,
                  examId: exam.id,
                  url: mappingImg.bytescale_url,
                  fileName: mappingImg.filename || `image-${i}.jpg`,
                  type: mappingImg.type || 'COLOR'
                }
              });

              totalImagesAdded++;
              console.log(`    ✓ Added image ${imageId} (${mappingImg.type || 'COLOR'})`);
            }
          } else {
            missingImages.forEach((img, idx) => {
              console.log(`    - Would add: img-UUID.jpg (${img.type || 'COLOR'})`);
            });
          }
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total exams checked: ${totalExamsChecked}`);
    console.log(`Exams with missing images: ${totalExamsWithMissingImages}`);
    console.log(`Total images missing: ${totalImagesMissing}`);

    if (!PREVIEW) {
      console.log(`Total images added: ${totalImagesAdded}`);
    } else {
      console.log('\nRun with --execute to apply changes');
    }

  } finally {
    await prisma.$disconnect();
  }
}

fixMissingImages().catch(console.error);
