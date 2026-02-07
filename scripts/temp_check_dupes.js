const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Check MARIA LUIZA FERREIRA MONTE - mapping has 2 entries with 42 images each
  const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');

  // Find all mapping entries for this patient
  const entries = Object.entries(mapping).filter(([k, v]) =>
    v.patient_name && v.patient_name.includes('MARIA LUIZA FERREIRA MONTE')
  );

  console.log(`=== MARIA LUIZA FERREIRA MONTE in mapping ===`);
  console.log(`Entries: ${entries.length}`);
  entries.forEach(([k, v]) => {
    console.log(`  Key: ${k}`);
    console.log(`  exam_id: ${v.exam_id}`);
    console.log(`  Images: ${v.images?.length}`);
    if (v.images) {
      v.images.slice(0, 3).forEach(img => console.log(`    ${img.filename} | ${img.bytescale_url?.substring(0, 80)}`));
    }
  });

  // Check if the 2 entries have same or different images
  if (entries.length >= 2) {
    const urls1 = new Set(entries[0][1].images?.map(i => i.bytescale_url) || []);
    const urls2 = new Set(entries[1][1].images?.map(i => i.bytescale_url) || []);
    const common = [...urls1].filter(u => urls2.has(u));
    console.log(`\n  Entry 1 URLs: ${urls1.size}`);
    console.log(`  Entry 2 URLs: ${urls2.size}`);
    console.log(`  Common URLs: ${common.length}`);
    console.log(`  Unique in entry 1: ${[...urls1].filter(u => !urls2.has(u)).length}`);
    console.log(`  Unique in entry 2: ${[...urls2].filter(u => !urls1.has(u)).length}`);
  }

  // In DB, check this patient's exam images for duplicate URLs
  const patient = await prisma.patient.findFirst({
    where: { name: { contains: 'MARIA LUIZA FERREIRA MONTE' } },
    include: {
      exams: {
        include: { images: { select: { id: true, url: true } } }
      }
    }
  });

  if (patient) {
    console.log(`\n=== DB ===`);
    console.log(`Patient: ${patient.name} (${patient.id})`);
    for (const exam of patient.exams) {
      const urls = exam.images.map(i => i.url);
      const uniqueUrls = new Set(urls);
      console.log(`  Exam ${exam.id}: ${exam.images.length} images (${uniqueUrls.size} unique URLs)`);
    }
  }

  // General: how many mapping entries have multiple folders with same exam_id?
  const examIdToEntries = {};
  for (const [k, v] of Object.entries(mapping)) {
    const eid = v.exam_id;
    if (!examIdToEntries[eid]) examIdToEntries[eid] = [];
    examIdToEntries[eid].push({ key: k, name: v.patient_name, imgCount: v.images?.length || 0 });
  }

  const multiEntryExams = Object.entries(examIdToEntries).filter(([id, entries]) => entries.length > 1);
  console.log(`\n=== EXAM IDs WITH MULTIPLE MAPPING ENTRIES ===`);
  console.log(`Total: ${multiEntryExams.length}`);
  multiEntryExams.slice(0, 10).forEach(([id, entries]) => {
    console.log(`  ${id} (${entries.length} entries):`);
    entries.forEach(e => console.log(`    ${e.name}: ${e.imgCount} imgs`));
  });

  await prisma.$disconnect();
}

main().catch(console.error);
