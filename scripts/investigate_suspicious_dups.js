/**
 * Deep-dive on the 4 duplicate-with-images cases + 7 date mismatches
 * flagged by scan_data_anomalies.js. Read-only.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function objectIdTimestamp(id) {
  if (!/^[0-9a-f]{24}$/i.test(id || '')) return null;
  const secs = parseInt(id.slice(0, 8), 16);
  return new Date(secs * 1000);
}

const DUP_CASES = [
  { patient: 'JUVINA GINO PEREIRA', pending: '69809d8e379c4e1a51cbd071', keep: '69809d8e1fa8062e17d3adc5' },
  { patient: 'LINDNALVA SIQUEIRA', pending: '6984cba6e1ff5209198cf9c1', keep: '6984cba693afdfe62c6fa80d' },
  { patient: 'JOSÉ RAIMUNDO DOS SANTOS', pending: '69838267a0e9c8adf6826e5e', keep: '6984cbab93afdfe62c6fa814' },
  { patient: 'DJALMA APARECIDO LOURENÇO', pending: '698386be6c333284694515cb', keep: '6983859f6c3332846945148c' },
];

const DATE_MISMATCHES = [
  '67cf69ab40887c82b0b3cbd5',
  '695eb54a4b0e754dac36a461',
  '695eb54a4b0e754dac36a460',
  '695eb54928b781ee600120eb',
  '695eb54826260539c166b330',
  '695eb5484b0e754dac36a45e',
  '695eb54b28b781ee600120f0',
];

async function fetchExam(id) {
  return prisma.exam.findUnique({
    where: { id },
    include: {
      patient: true,
      images: { select: { id: true, url: true, type: true } },
      report: { select: { id: true, selectedImages: true, completedAt: true, doctorName: true } },
      referral: { select: { id: true } },
    },
  });
}

function hashUrls(images) {
  return images.map((i) => i.url).sort().join('|');
}

async function main() {
  console.log('\n=== DUPLICATE-WITH-IMAGES DEEP-DIVE ===\n');
  for (const c of DUP_CASES) {
    const pending = await fetchExam(c.pending);
    const keep = await fetchExam(c.keep);
    const pendingTs = objectIdTimestamp(c.pending);
    const keepTs = objectIdTimestamp(c.keep);
    console.log(`>>> ${c.patient}`);
    console.log(`  PENDING ${c.pending}`);
    console.log(`    created=${pendingTs?.toISOString()} examDate=${pending.examDate?.toISOString?.().slice(0, 10)} loc=${pending.location}`);
    console.log(`    imgs=${pending.images.length} report=${!!pending.report} referral=${!!pending.referral} status=${pending.status}`);
    console.log(`  KEEP    ${c.keep}`);
    console.log(`    created=${keepTs?.toISOString()} examDate=${keep.examDate?.toISOString?.().slice(0, 10)} loc=${keep.location}`);
    console.log(`    imgs=${keep.images.length} report=${!!keep.report} referral=${!!keep.referral} status=${keep.status}`);

    const pHash = hashUrls(pending.images);
    const kHash = hashUrls(keep.images);
    const sameUrls = pHash === kHash;
    const overlap = pending.images.filter((i) => keep.images.some((j) => j.url === i.url)).length;
    console.log(`  URL overlap: ${overlap}/${pending.images.length} pending imgs also in keep | sameUrls=${sameUrls}`);

    // Sample urls
    console.log(`  pending urls (first 3): ${pending.images.slice(0, 3).map((i) => i.url.split('/').pop()).join(', ')}`);
    console.log(`  keep    urls (first 3): ${keep.images.slice(0, 3).map((i) => i.url.split('/').pop()).join(', ')}`);
    console.log('');
  }

  console.log('\n=== DATE MISMATCH DEEP-DIVE ===\n');
  for (const id of DATE_MISMATCHES) {
    const e = await fetchExam(id);
    if (!e) {
      console.log(`  ${id} NOT FOUND`);
      continue;
    }
    const idTs = objectIdTimestamp(id);
    console.log(`>>> ${e.patient.name}  (exam ${id})`);
    console.log(`    objectId ts=${idTs?.toISOString().slice(0, 10)}  examDate=${e.examDate?.toISOString?.().slice(0, 10)}  location=${e.location}`);
    console.log(`    imgs=${e.images.length} report=${!!e.report} status=${e.status}`);
    console.log(`    patient.createdAt=${e.patient.createdAt?.toISOString?.()}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
