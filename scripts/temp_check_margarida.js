const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  // DB
  const pats = await p.patient.findMany({
    where: { name: { contains: 'MARGARIDA', mode: 'insensitive' } },
    select: { id: true, name: true, underlyingDiseases: true, ophthalmicDiseases: true }
  });
  console.log('=== DB ===');
  for (const pat of pats) {
    console.log(`${pat.name} (${pat.id})`);
    console.log(`  underlying: ${JSON.stringify(pat.underlyingDiseases)}`);
    console.log(`  ophthalmic: ${JSON.stringify(pat.ophthalmicDiseases)}`);
  }

  // State
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader', 'download_state.json'), 'utf8'));
  console.log('\n=== DOWNLOAD STATE ===');
  for (const [id, detail] of Object.entries(state.exam_details)) {
    if (detail.patient_name && detail.patient_name.includes('MARGARIDA')) {
      console.log(`${detail.patient_name} (exam: ${id})`);
      console.log(`  underlying: ${JSON.stringify(detail.underlying_diseases)}`);
      console.log(`  ophthalmic: ${JSON.stringify(detail.ophthalmic_diseases)}`);
      console.log(`  raw keys: ${Object.keys(detail).join(', ')}`);
    }
  }

  await p.$disconnect();
}
main();
