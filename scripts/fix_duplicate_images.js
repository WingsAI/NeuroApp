/**
 * fix_duplicate_images.js - Remove imagens duplicadas (entradas double no mapping)
 * ==================================================================================
 *
 * O mapping tem 154 exam_ids com 2 entradas cada (folder short-ID e folder long-ID).
 * Ambas foram importadas, gerando ~2x imagens por exame.
 *
 * Estratégia: manter as imagens da primeira entrada (long-ID folder), remover as da segunda.
 *
 * Uso:
 *   node scripts/fix_duplicate_images.js              # Preview
 *   node scripts/fix_duplicate_images.js --execute     # Aplicar
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(execute ? 'MODO EXECUÇÃO' : 'MODO PREVIEW');

  const mapping = require('./eyercloud_downloader/bytescale_mapping_cleaned.json');
  const state = require('./eyercloud_downloader/download_state.json');

  // Find exam_ids with multiple mapping entries
  const examIdToEntries = {};
  for (const [key, entry] of Object.entries(mapping)) {
    const eid = entry.exam_id;
    if (!eid || eid.length !== 24) continue;
    if (!examIdToEntries[eid]) examIdToEntries[eid] = [];
    examIdToEntries[eid].push({ key, entry });
  }

  const multiEntries = Object.entries(examIdToEntries).filter(([id, entries]) => entries.length > 1);
  console.log(`Exam IDs with multiple mapping entries: ${multiEntries.length}`);

  // For each such exam, identify which images to keep and which to remove
  let totalToRemove = 0;
  let totalToKeep = 0;
  let processed = 0;

  for (const [examId, entries] of multiEntries) {
    // Get expected image count from state
    const stateData = state.exam_details?.[examId];
    const expectedImages = stateData?.expected_images || 0;

    // Get all images for this exam from DB
    const dbImages = await prisma.examImage.findMany({
      where: { examId },
      orderBy: { uploadedAt: 'asc' }
    });

    if (dbImages.length <= expectedImages || dbImages.length <= entries[0].entry.images?.length) {
      continue; // No excess images
    }

    // The first entry (long-ID folder key, which has the original images) should be kept
    // Identify URLs from each entry
    const entry1Urls = new Set((entries[0].entry.images || []).map(i => i.bytescale_url).filter(Boolean));
    const entry2Urls = new Set((entries[1].entry.images || []).map(i => i.bytescale_url).filter(Boolean));

    // Images to keep: those from entry 1 (or entry 2 if entry 1 has fewer)
    // Keep whichever set has the most images (or the first one)
    const keepUrls = entry1Urls.size >= entry2Urls.size ? entry1Urls : entry2Urls;
    const removeUrls = entry1Urls.size >= entry2Urls.size ? entry2Urls : entry1Urls;

    // But only remove URLs that are NOT in the keep set
    const toRemove = dbImages.filter(img => removeUrls.has(img.url) && !keepUrls.has(img.url));

    if (toRemove.length === 0) continue;

    processed++;
    totalToRemove += toRemove.length;
    totalToKeep += dbImages.length - toRemove.length;

    const patientName = entries[0].entry.patient_name;
    console.log(`  ${patientName} | exam ${examId.substring(0, 16)}... | DB: ${dbImages.length} → keep: ${dbImages.length - toRemove.length} (expected: ${expectedImages}) | remove: ${toRemove.length}`);

    if (execute) {
      for (const img of toRemove) {
        await prisma.examImage.delete({ where: { id: img.id } });
      }
    }
  }

  console.log(`\nProcessed: ${processed} exams`);
  console.log(`To remove: ${totalToRemove} images`);
  console.log(`Keeping: ${totalToKeep} images`);

  // Final counts
  const finalImages = await prisma.examImage.count();
  const finalExams = await prisma.exam.count();
  const finalPatients = await prisma.patient.count();
  const finalReports = await prisma.medicalReport.count();
  console.log(`\nDB: ${finalPatients} patients, ${finalExams} exams, ${finalImages} images, ${finalReports} reports`);

  await prisma.$disconnect();
}

main().catch(console.error);
