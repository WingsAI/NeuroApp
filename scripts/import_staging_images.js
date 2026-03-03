/**
 * import_staging_images.js
 *
 * Imports Bytescale image URLs from mapping files into the staging DB.
 * Reads bytescale_mapping_staging_*.json and creates StagingExamImage records.
 *
 * Usage:
 *   node scripts/import_staging_images.js              (preview)
 *   node scripts/import_staging_images.js --execute    (write to DB)
 */

require('dotenv').config({ path: __dirname + '/../prisma-staging/.env' });
const { PrismaClient } = require('.prisma/client-staging');
const fs = require('fs');
const path = require('path');

const EXECUTE = process.argv.includes('--execute');
const ROOT = path.resolve(__dirname, '..');

const MAPPINGS = [
  {
    file: path.join(ROOT, 'bytescale_mapping_staging_dramelinalannes_endocrino.json'),
    email: 'dramelinalannes.endocrino@gmail.com',
    label: 'Melina',
  },
  {
    file: path.join(ROOT, 'bytescale_mapping_staging_mozaniareis.json'),
    email: 'mozaniareis@usp.br',
    label: 'Mozania',
  },
];

// Override DATABASE_URL with STAGING_DATABASE_URL for this script
process.env.DATABASE_URL = process.env.STAGING_DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.STAGING_DATABASE_URL } },
});

function loadJson(fpath) {
  if (!fs.existsSync(fpath)) return null;
  return JSON.parse(fs.readFileSync(fpath, 'utf-8'));
}

async function main() {
  console.log('='.repeat(60));
  console.log('  Import Staging Images from Bytescale Mapping');
  console.log(`  Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW (use --execute to write)'}`);
  console.log('='.repeat(60));

  if (!process.env.STAGING_DATABASE_URL) {
    console.error('ERROR: STAGING_DATABASE_URL not set in .env');
    process.exit(1);
  }

  // Load all staging exams from DB (id -> examId lookup)
  console.log('\nLoading staging exams from DB...');
  const stagingExams = await prisma.stagingExam.findMany({
    select: { id: true, patientId: true },
  });
  const examIds = new Set(stagingExams.map(e => e.id));
  console.log(`  ${stagingExams.length} exams in staging DB`);

  // Load existing images to check which need URL updates
  const existingImages = await prisma.stagingExamImage.findMany({
    select: { id: true, url: true },
  });
  const existingById = new Map(existingImages.map(i => [i.id, i.url]));
  const emptyUrls = existingImages.filter(i => !i.url).length;
  console.log(`  ${existingImages.size} images in staging DB (${emptyUrls} with empty URL)`);

  let totalNew = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalMissingExam = 0;

  for (const { file, email, label } of MAPPINGS) {
    console.log(`\n--- ${label} (${email}) ---`);

    const mapping = loadJson(file);
    if (!mapping) {
      console.log(`  SKIP: mapping file not found: ${file}`);
      continue;
    }

    const entries = Object.values(mapping);
    console.log(`  ${entries.length} folder entries in mapping`);

    const toInsert = [];
    const toUpdate = []; // {id, url}

    for (const entry of entries) {
      const examId = entry.exam_id;

      if (!examId || !examIds.has(examId)) {
        totalMissingExam++;
        continue;
      }

      for (const img of entry.images || []) {
        const uuid = img.uuid;
        if (!uuid) continue;

        const imgId = `img-${uuid}.jpg`;
        const cdnUrl = img.cdn_url || img.bytescale_url || '';
        if (!cdnUrl) continue;

        if (existingById.has(imgId)) {
          const currentUrl = existingById.get(imgId);
          if (!currentUrl) {
            // Exists but URL is empty — update it
            toUpdate.push({ id: imgId, url: cdnUrl });
          } else {
            totalSkipped++;
          }
        } else {
          // New record
          toInsert.push({
            id: imgId,
            url: cdnUrl,
            fileName: img.filename || `${uuid}.jpg`,
            type: img.type || 'UNKNOWN',
            eyerUuid: uuid,
            examId: examId,
          });
        }
      }
    }

    console.log(`  To insert: ${toInsert.length} | To update URL: ${toUpdate.length} | Already OK: ${totalSkipped}`);
    totalNew += toInsert.length;
    totalUpdated += toUpdate.length;

    if (EXECUTE) {
      // Insert new
      if (toInsert.length > 0) {
        const BATCH = 500;
        let inserted = 0;
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH);
          const result = await prisma.stagingExamImage.createMany({ data: batch, skipDuplicates: true });
          inserted += result.count;
        }
        console.log(`  Inserted: ${inserted} new images`);
      }

      // Update URLs one by one (no updateMany with different values per row in Prisma)
      if (toUpdate.length > 0) {
        let updated = 0;
        for (const { id, url } of toUpdate) {
          await prisma.stagingExamImage.update({ where: { id }, data: { url } });
          updated++;
          if (updated % 500 === 0) process.stdout.write(`\r  Updated URLs: ${updated}/${toUpdate.length}`);
        }
        console.log(`\n  Updated: ${updated} image URLs`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  SUMMARY');
  console.log('='.repeat(60));
  console.log(`  New images inserted:    ${totalNew}`);
  console.log(`  URLs updated:          ${totalUpdated}`);
  console.log(`  Already OK (skip):     ${totalSkipped}`);
  console.log(`  Missing exam in DB:    ${totalMissingExam}`);
  console.log('='.repeat(60));

  if (!EXECUTE) {
    console.log('\n  Run with --execute to write to DB.');
  } else {
    console.log('\n  Import complete!');
    const withUrl = await prisma.stagingExamImage.count({ where: { url: { not: '' } } });
    const withoutUrl = await prisma.stagingExamImage.count({ where: { url: '' } });
    console.log(`  Images with URL: ${withUrl} | Without URL: ${withoutUrl}`);
  }
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
