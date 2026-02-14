/**
 * Trace the exact problem with FRANCISCO SERGIO OLIVEIRA.
 *
 * The mapping file v2 (long-ID key) has images in this order:
 *   [0] 4085a695 (COLOR)
 *   [1] 7b4ad073 (COLOR)
 *   [2] a0def6bf (COLOR)
 *   [3] abc4e39d (COLOR)
 *   [4] cb02abec (COLOR)
 *   [5] fa3f5498 (COLOR)      ← mapping index 5
 *   [6] 11d63c88 (ANTERIOR)   ← mapping index 6
 *   [7-13] REDFREE (filtered out) + a0b142b2 (ANTERIOR at index 11)
 *
 * sync_eyercloud_full.js creates image IDs as "examId-{mappingIndex}"
 * So examId-5 = fa3f5498 (COLOR) and examId-6 = 11d63c88 (ANTERIOR)
 *
 * BUT! There's also index 11 = a0b142b2 (ANTERIOR), giving ID examId-11
 *
 * When the doctor originally selected images, he selected by POSITION
 * on screen, which depends on how the UI sorts the images.
 *
 * The question is: Did the doctor select examId-5 and examId-6 as his
 * original choice? Or did the import/fix scripts change the selectedImages?
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const exam = await p.exam.findUnique({
    where: { id: '697001ce4e429636ed944c10' },
    include: {
      images: true, // NO orderBy - see raw order
      report: true,
      patient: { select: { name: true } }
    }
  });

  console.log('=== RAW IMAGE ORDER (no orderBy) ===');
  exam.images.forEach((img, i) => {
    const filename = img.url ? decodeURIComponent(img.url).split('/').pop().split('?')[0] : '?';
    console.log(`  [${i}] ${img.id} (${img.type}) - ${filename}`);
  });

  console.log('\n=== SORTED BY ID ASC (string sort - what the UI sees) ===');
  const sorted = [...exam.images].sort((a, b) => a.id.localeCompare(b.id));
  sorted.forEach((img, i) => {
    const filename = img.url ? decodeURIComponent(img.url).split('/').pop().split('?')[0] : '?';
    console.log(`  [${i}] ${img.id} (${img.type}) - ${filename}`);
  });

  console.log('\n=== SORTED BY SUFFIX NUMBER (what doctor intended) ===');
  const numSorted = [...exam.images].sort((a, b) => {
    const na = parseInt(a.id.match(/-(\d+)$/)?.[1] || '0');
    const nb = parseInt(b.id.match(/-(\d+)$/)?.[1] || '0');
    return na - nb;
  });
  numSorted.forEach((img, i) => {
    const suffix = img.id.match(/-(\d+)$/)?.[1] || '?';
    const filename = img.url ? decodeURIComponent(img.url).split('/').pop().split('?')[0] : '?';
    console.log(`  [${i}] ${img.id} (suffix: ${suffix}) (${img.type}) - ${filename}`);
  });

  // The mapping file order:
  const fs = require('fs');
  const path = require('path');
  const v2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json'), 'utf-8'));
  const entry = v2['FRANCISCO_SERGIO_OLIVEIRA_697001ce4e429636ed944c10'];

  if (entry) {
    console.log('\n=== MAPPING ORDER (original upload order) ===');
    entry.images.forEach((img, i) => {
      console.log(`  [${i}] ${img.filename}`);
    });
  }

  // Show the report
  console.log(`\n=== REPORT ===`);
  console.log(`selectedImages: ${JSON.stringify(exam.report?.selectedImages)}`);
  console.log(`completedAt: ${exam.report?.completedAt}`);
  console.log(`doctorName: ${exam.report?.doctorName}`);

  // The key question: which image IDs did the doctor ORIGINALLY select?
  // If the doctor used the medical page which shows images in a grid,
  // what order did they see?
  // Check medical/page.tsx to see how images are ordered

  console.log('\n=== ANALYSIS ===');
  console.log('selectedImages.od = examId-6 -> file: 11d63c88 -> type: ANTERIOR');
  console.log('selectedImages.oe = examId-5 -> file: fa3f5498 -> type: COLOR');
  console.log('');
  console.log('Doctor says he selected COLOR for OD, but now sees ANTERIOR.');
  console.log('Doctor says OE now shows what was originally his OD selection.');
  console.log('');
  console.log('This means the doctor ORIGINALLY selected:');
  console.log('  OD: a COLOR image (possibly fa3f5498 = examId-5)');
  console.log('  OE: another image');
  console.log('');
  console.log('But the selectedImages was overwritten to:');
  console.log('  od: examId-6 (ANTERIOR)');
  console.log('  oe: examId-5 (COLOR = the old OD)');
  console.log('');
  console.log('Question: Who changed selectedImages? Was it our fix scripts?');

  // Check if this patient had CML IDs that were fixed
  // The fix_all_data_issues.js resolved old IDs to new by INDEX
  // If old selectedImages was like "cml...-5" and "cml...-6"
  // the script would resolve -5 to images[5] and -6 to images[6]
  // But images[5] and images[6] depend on the SORT ORDER!

  // With string sort: images[5] = examId-4, images[6] = examId-5
  // With numeric sort: images[5] = examId-5, images[6] = examId-6

  console.log('\n=== STRING SORT vs NUMERIC SORT POSITION MISMATCH ===');
  console.log('String-sorted position 5 = ' + sorted[5]?.id + ' (' + sorted[5]?.type + ')');
  console.log('String-sorted position 6 = ' + sorted[6]?.id + ' (' + sorted[6]?.type + ')');
  console.log('Numeric-sorted position 5 = ' + numSorted[5]?.id + ' (' + numSorted[5]?.type + ')');
  console.log('Numeric-sorted position 6 = ' + numSorted[6]?.id + ' (' + numSorted[6]?.type + ')');

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
