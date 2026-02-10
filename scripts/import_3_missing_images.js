const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PREVIEW = !process.argv.includes('--execute');

// These 3 exams have images downloaded + uploaded to Bytescale but not in DB
const EXAMS = [
  {
    examId: '69809d9f51ffa0242a2cdddb',
    folderKey: 'APARECIDO_ROBERTO_LOCAISE_69809d9f',
    patient: 'APARECIDO ROBERTO LOCAISE'
  },
  {
    examId: '69809d8e379c4e1a51cbd071',
    folderKey: 'JUVINA_GINO_PEREIRA_69809d8e',
    patient: 'JUVINA GINO PEREIRA'
  },
  {
    examId: '6984cba6e1ff5209198cf9c1',
    folderKey: 'LINDNALVA_SIQUEIRA_6984cba6',
    patient: 'LINDNALVA SIQUEIRA'
  }
];

async function importImages() {
  console.log('=== Import 3 Missing Patient Images ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');
  const metadataDir = path.join(__dirname, 'eyercloud_downloader', 'downloads');

  let totalAdded = 0;

  try {
    for (const examInfo of EXAMS) {
      console.log(`\n=== ${examInfo.patient} ===`);
      console.log(`  Exam ID: ${examInfo.examId}`);

      // Verify exam exists in DB
      const exam = await prisma.exam.findUnique({
        where: { id: examInfo.examId },
        include: { images: true }
      });

      if (!exam) {
        console.log('  Exam NOT found in DB - skipping');
        continue;
      }

      console.log(`  DB images: ${exam.images.length}`);

      if (exam.images.length > 0) {
        console.log('  Already has images - skipping');
        continue;
      }

      // Load metadata.json for correct types (already filtered COLOR+ANTERIOR)
      const metadataFile = path.join(metadataDir, examInfo.folderKey, 'metadata.json');
      if (!fs.existsSync(metadataFile)) {
        console.log('  metadata.json not found - skipping');
        continue;
      }

      const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf-8'));
      const validImages = metadata.images;

      // Get Bytescale URLs from mapping
      const mappingEntry = mapping[examInfo.folderKey];
      if (!mappingEntry) {
        console.log('  Not found in bytescale_mapping_v2.json - skipping');
        continue;
      }

      // Build UUID -> bytescale_url lookup
      const urlLookup = {};
      for (const img of mappingEntry.images) {
        const uuid = img.filename.replace('.jpg', '');
        urlLookup[uuid] = img.bytescale_url;
      }

      console.log(`  Valid images (COLOR+ANTERIOR): ${validImages.length}`);

      for (const img of validImages) {
        const bytescaleUrl = urlLookup[img.uuid];
        if (!bytescaleUrl) {
          console.log(`  ${img.uuid.substring(0, 8)}... - No Bytescale URL found`);
          continue;
        }

        const imageId = `img-${crypto.randomUUID()}.jpg`;

        if (PREVIEW) {
          console.log(`  Would add: ${img.type} ${img.uuid.substring(0, 12)}... -> ${bytescaleUrl.substring(0, 60)}...`);
        } else {
          await prisma.examImage.create({
            data: {
              id: imageId,
              examId: examInfo.examId,
              url: bytescaleUrl,
              fileName: img.filename,
              type: img.type
            }
          });
          console.log(`  Added: ${img.type} ${img.uuid.substring(0, 12)}...`);
        }
        totalAdded++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total images ${PREVIEW ? 'to add' : 'added'}: ${totalAdded}`);

    if (PREVIEW && totalAdded > 0) {
      console.log('\nRun with --execute to apply changes');
    }
  } finally {
    await prisma.$disconnect();
  }
}

importImages().catch(console.error);
