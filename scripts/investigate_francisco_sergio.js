/**
 * Deep investigation of FRANCISCO SERGIO OLIVEIRA's image order problem.
 *
 * The doctor reports:
 * - OD: Shows ANTERIOR image instead of the COLOR retinal image he selected
 * - OE: Shows the image that used to be his OD selection (swapped)
 * - CPF was correct
 *
 * Hypothesis: Image reimport changed the order/IDs of images, shifting
 * the index-based references.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  const pat = await p.patient.findFirst({
    where: { name: { contains: 'FRANCISCO SERGIO', mode: 'insensitive' } },
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  if (!pat) { console.log('Not found'); await p.$disconnect(); return; }

  console.log(`Patient: ${pat.name} (ID: ${pat.id})`);
  console.log(`CPF: ${pat.cpf}`);

  const exam = pat.exams[0];
  console.log(`\nExam: ${exam.id}`);
  console.log(`\nCurrent images (ordered by ID asc):`);
  exam.images.forEach((img, i) => {
    console.log(`  [${i}] ${img.id} (${img.type}) - ${img.url ? decodeURIComponent(img.url).split('/').pop() : 'no url'}`);
  });

  // Report
  const si = exam.report?.selectedImages;
  console.log(`\nselectedImages: ${JSON.stringify(si)}`);

  if (si) {
    for (const eye of ['od', 'oe']) {
      const id = si[eye];
      if (!id) { console.log(`  ${eye}: null`); continue; }
      const img = exam.images.find(i => i.id === id);
      if (img) {
        console.log(`  ${eye}: ${id} -> ${img.type} (file: ${img.url ? decodeURIComponent(img.url).split('/').pop() : '?'})`);
      } else {
        console.log(`  ${eye}: ${id} -> NOT FOUND`);
      }
    }
  }

  // Check mapping file for original image order
  const v2Path = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_v2.json');
  const mapping = JSON.parse(fs.readFileSync(v2Path, 'utf-8'));

  console.log(`\n--- Bytescale Mapping v2 ---`);
  for (const [key, data] of Object.entries(mapping)) {
    if (data.exam_id === exam.id || key.includes('FRANCISCO_SERGIO')) {
      console.log(`\nKey: ${key}`);
      console.log(`exam_id: ${data.exam_id}`);
      console.log(`cpf: ${data.cpf}`);
      console.log(`Images (${data.images.length}):`);
      data.images.forEach((img, i) => {
        console.log(`  [${i}] ${img.filename} (${img.type || 'UNKNOWN'}) - ${img.bytescale_url?.split('/').pop()}`);
      });
    }
  }

  // Check cleaned mapping too
  const cleanedPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
  const cleanedMapping = JSON.parse(fs.readFileSync(cleanedPath, 'utf-8'));

  console.log(`\n--- Bytescale Mapping Cleaned ---`);
  for (const [key, data] of Object.entries(cleanedMapping)) {
    if ((data.exam_id && data.exam_id === exam.id) || key.includes('FRANCISCO_SERGIO')) {
      console.log(`\nKey: ${key}`);
      console.log(`exam_id: ${data.exam_id}`);
      console.log(`cpf: ${data.cpf}`);
      console.log(`Images (${data.images.length}):`);
      data.images.forEach((img, i) => {
        console.log(`  [${i}] ${img.filename} (${img.type || 'UNKNOWN'}) - ${img.bytescale_url?.split('/').pop()}`);
      });
    }
  }

  // Check download_state for image details
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  console.log(`\n--- Download State ---`);
  // Search by exam ID
  if (state[exam.id]) {
    const s = state[exam.id];
    console.log(`Found by exam ID: ${exam.id}`);
    console.log(`patient_name: ${s.patient_name}`);
    console.log(`expected_images: ${s.expected_images}`);
    if (s.image_details) {
      console.log(`image_details (${s.image_details.length}):`);
      s.image_details.forEach((img, i) => {
        console.log(`  [${i}] ${img.type} - UUID: ${img.uuid}`);
      });
    }
  } else {
    // Search by name
    let found = false;
    for (const [eid, s] of Object.entries(state)) {
      if (s.patient_name && s.patient_name.toUpperCase().includes('FRANCISCO SERGIO')) {
        found = true;
        console.log(`Found by name: ${eid}`);
        console.log(`patient_name: ${s.patient_name}`);
        console.log(`expected_images: ${s.expected_images}`);
        if (s.image_details) {
          console.log(`image_details (${s.image_details.length}):`);
          s.image_details.forEach((img, i) => {
            console.log(`  [${i}] ${img.type} - UUID: ${img.uuid}`);
          });
        }
      }
    }
    if (!found) console.log('NOT FOUND in download_state');
  }

  // Now check: what USED to be at index 5 and 6?
  // The old selectedImages used format "examId-N" where N is the index
  // Current: od=examId-6 (ANTERIOR), oe=examId-5 (COLOR)
  // Doctor says: OD should be COLOR (retinal), OE shows what was originally OD
  // This means the images shifted when reimported

  // Check image_types.json for this exam
  const typesPath = path.join(__dirname, 'eyercloud_downloader', 'image_types.json');
  if (fs.existsSync(typesPath)) {
    const types = JSON.parse(fs.readFileSync(typesPath, 'utf-8'));
    console.log(`\n--- Image Types (EyerCloud API) ---`);
    // Find images for this exam by matching UUIDs
    for (const img of exam.images) {
      const filename = img.url ? decodeURIComponent(img.url).split('/').pop().split('?')[0] : null;
      const uuid = filename?.replace('.jpg', '').replace('.png', '');
      if (uuid && types[uuid]) {
        console.log(`  ${uuid} -> EyerCloud type: ${types[uuid]} | DB type: ${img.type}`);
      }
    }
  }

  // Cross-reference: show which images from mapping are now at which index
  console.log(`\n--- IMAGE ORDER ANALYSIS ---`);
  console.log(`\nDB image order (by ID sort):`);
  exam.images.forEach((img, i) => {
    const filename = img.url ? decodeURIComponent(img.url).split('/').pop().split('?')[0] : '?';
    console.log(`  index ${i}: ID=${img.id.split('-').pop()} type=${img.type} file=${filename}`);
  });

  console.log(`\nDoctor's report says:`);
  console.log(`  OD (${si?.od}): Currently showing ${exam.images.find(i => i.id === si?.od)?.type || '?'}`);
  console.log(`  OE (${si?.oe}): Currently showing ${exam.images.find(i => i.id === si?.oe)?.type || '?'}`);
  console.log(`\nDoctor expected:`);
  console.log(`  OD: COLOR (retinal fundus)`);
  console.log(`  OE: A different COLOR image (not the same as OD)`);

  // Look at old image IDs - what was the original import order?
  // The -N suffix in IDs comes from the import order in the mapping file
  // examId-0, examId-1, ... examId-N
  // Images are ordered by ID asc, so examId-0 < examId-1 < examId-10 (string sort!)
  // String sort: "examId-0" < "examId-1" < "examId-10" < "examId-11" < "examId-2"

  console.log(`\n--- STRING SORT ANALYSIS ---`);
  console.log(`The IDs are sorted as strings, not numbers!`);
  const ids = exam.images.map(i => i.id);
  console.log(`Sorted IDs: ${ids.join(', ')}`);

  // The suffix numbers:
  const suffixes = ids.map(id => {
    const m = id.match(/-(\d+)$/);
    return m ? parseInt(m[1]) : -1;
  });
  console.log(`Suffix numbers (in current order): ${suffixes.join(', ')}`);
  console.log(`If sorted numerically: ${[...suffixes].sort((a,b) => a-b).join(', ')}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
