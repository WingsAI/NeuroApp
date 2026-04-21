/**
 * Verify that the 2 "pending duplicate" exams (JUVINA, LINDNALVA) are safe to delete:
 *   - No MedicalReport row on the pending exam (already confirmed)
 *   - No selectedImages anywhere referencing the pending exam's image IDs
 *   - No SelectedImagesHistory pointing at pending images
 *   - No referral row on the pending exam (already confirmed)
 *
 * Also inspects DJALMA and JOSÉ RAIMUNDO for context, no action proposed.
 * Read-only.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CASES = [
  { patient: 'JUVINA GINO PEREIRA', pending: '69809d8e379c4e1a51cbd071', keep: '69809d8e1fa8062e17d3adc5' },
  { patient: 'LINDNALVA SIQUEIRA', pending: '6984cba6e1ff5209198cf9c1', keep: '6984cba693afdfe62c6fa80d' },
  { patient: 'JOSÉ RAIMUNDO DOS SANTOS', pending: '69838267a0e9c8adf6826e5e', keep: '6984cbab93afdfe62c6fa814' },
  { patient: 'DJALMA APARECIDO LOURENÇO', pending: '698386be6c333284694515cb', keep: '6983859f6c3332846945148c' },
];

async function main() {
  for (const c of CASES) {
    console.log(`\n>>> ${c.patient}`);
    const pending = await prisma.exam.findUnique({
      where: { id: c.pending },
      include: { images: true, report: true, referral: true },
    });
    const keep = await prisma.exam.findUnique({
      where: { id: c.keep },
      include: { images: true, report: true },
    });
    if (!pending) {
      console.log('  PENDING NOT FOUND');
      continue;
    }
    const pendingImageIds = pending.images.map((i) => i.id);
    const keepImageIds = keep.images.map((i) => i.id);
    const overlapIds = pendingImageIds.filter((id) => keepImageIds.includes(id));
    console.log(`  pending imgs: ${pending.images.length}  keep imgs: ${keep.images.length}  shared ids: ${overlapIds.length}`);
    console.log(`  pending sample id: ${pendingImageIds[0]}`);
    console.log(`  keep    sample id: ${keepImageIds[0]}`);

    // Any report whose selectedImages references any pending image id?
    const allReports = await prisma.medicalReport.findMany({
      select: { id: true, examId: true, selectedImages: true },
    });
    const hits = allReports.filter((r) => {
      const sel = r.selectedImages;
      if (!sel) return false;
      return [sel.od, sel.oe].some((x) => x && pendingImageIds.includes(x));
    });
    console.log(`  reports referencing pending image IDs: ${hits.length}`);
    hits.forEach((h) => console.log(`    -> report ${h.id} on exam ${h.examId}: ${JSON.stringify(h.selectedImages)}`));

    // SelectedImagesHistory table
    const history = await prisma.selectedImagesHistory.findMany({
      where: {
        OR: [
          { previousOd: { in: pendingImageIds } },
          { previousOe: { in: pendingImageIds } },
          { newOd: { in: pendingImageIds } },
          { newOe: { in: pendingImageIds } },
        ],
      },
    });
    console.log(`  SelectedImagesHistory rows referencing pending image IDs: ${history.length}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
