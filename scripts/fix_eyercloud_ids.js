/**
 * fix_eyercloud_ids.js - Fix eyerCloudId field on exams
 * ======================================================
 *
 * Issues:
 * 1. 27 exams have 8-char eyerCloudId (should be 24-char, same as exam.id)
 * 2. 114 non-CML exams have eyerCloudId pointing to a different exam
 *
 * Fix: For non-CML exams with 24-char hex id, set eyerCloudId = id
 *
 * Uso:
 *   node scripts/fix_eyercloud_ids.js              # Preview
 *   node scripts/fix_eyercloud_ids.js --execute     # Aplicar
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(execute ? 'MODO EXECUCAO' : 'MODO PREVIEW');

  const exams = await prisma.exam.findMany({
    include: { patient: { select: { name: true } } }
  });

  // Find exams that need fixing
  const toFix = exams.filter(e => {
    // Only fix EyerCloud exams (24-char hex id)
    if (!/^[a-f0-9]{24}$/.test(e.id)) return false;
    // Fix if eyerCloudId is wrong
    return e.eyerCloudId !== e.id;
  });

  console.log(`Total exams: ${exams.length}`);
  console.log(`Exams needing eyerCloudId fix: ${toFix.length}`);

  // Categorize
  const shortEyer = toFix.filter(e => e.eyerCloudId && e.eyerCloudId.length < 24);
  const mismatch = toFix.filter(e => e.eyerCloudId && e.eyerCloudId.length === 24 && e.eyerCloudId !== e.id);
  const nullEyer = toFix.filter(e => !e.eyerCloudId);

  console.log(`  Short eyerCloudId (8 chars): ${shortEyer.length}`);
  console.log(`  Mismatched eyerCloudId: ${mismatch.length}`);
  console.log(`  Null eyerCloudId: ${nullEyer.length}`);

  if (toFix.length > 0) {
    console.log('\nSample fixes:');
    for (const e of toFix.slice(0, 5)) {
      console.log(`  ${e.patient.name.substring(0, 30).padEnd(30)} | eyer: ${(e.eyerCloudId || 'NULL').padEnd(24)} -> ${e.id}`);
    }
  }

  if (execute && toFix.length > 0) {
    console.log(`\nFixing ${toFix.length} exams...`);
    const ids = toFix.map(e => e.id);

    // Batch update in chunks
    for (let i = 0; i < toFix.length; i++) {
      await prisma.exam.update({
        where: { id: toFix[i].id },
        data: { eyerCloudId: toFix[i].id }
      });
    }
    console.log(`Fixed ${toFix.length} exams`);
  }

  // Verify
  const postFix = await prisma.exam.findMany({ select: { id: true, eyerCloudId: true } });
  const stillBad = postFix.filter(e => {
    if (!/^[a-f0-9]{24}$/.test(e.id)) return false;
    return e.eyerCloudId !== e.id;
  });
  console.log(`\nAfter fix: ${stillBad.length} EyerCloud exams with wrong eyerCloudId`);

  // Check CML exams (should keep their eyerCloudId pointing to the linked exam)
  const cmlExams = postFix.filter(e => e.id.startsWith('cml'));
  const cmlWithEyer = cmlExams.filter(e => e.eyerCloudId && /^[a-f0-9]{24}$/.test(e.eyerCloudId));
  console.log(`CML exams: ${cmlExams.length} (${cmlWithEyer.length} with valid eyerCloudId link)`);

  await prisma.$disconnect();
}

main().catch(console.error);
