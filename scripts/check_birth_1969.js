const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

async function main() {
  // Find patients with birthDate around 31/12/1969
  // Unix epoch 0 = 01/01/1970 00:00:00 UTC
  // In UTC-3 (Brazil), epoch 0 = 31/12/1969 21:00:00
  // So birthDate = 31/12/1969 likely means the value was set to epoch 0 (null/default)

  const patients = await p.patient.findMany({
    where: {
      birthDate: {
        gte: new Date('1969-12-31T00:00:00Z'),
        lte: new Date('1970-01-01T23:59:59Z')
      }
    },
    select: { id: true, name: true, birthDate: true, cpf: true }
  });

  console.log(`Patients with birthDate around 31/12/1969 - 01/01/1970: ${patients.length}\n`);

  // Load patient_details.json for real birth dates
  const detailsPath = path.join(__dirname, 'eyercloud_downloader', 'patient_details.json');
  const details = JSON.parse(fs.readFileSync(detailsPath, 'utf-8'));

  // Also load download_state.json
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  for (const pat of patients) {
    console.log(`${pat.name} (ID: ${pat.id})`);
    console.log(`  DB birthDate: ${pat.birthDate}`);

    // Check patient_details.json
    let found = false;
    for (const [id, d] of Object.entries(details)) {
      if (d.fullName && d.fullName.toUpperCase().trim() === pat.name.toUpperCase().trim()) {
        console.log(`  EyerCloud (patient_details): birthday="${d.birthday}" fullName="${d.fullName}"`);
        found = true;
        break;
      }
    }

    // Check download_state.json
    for (const [eid, s] of Object.entries(state)) {
      if (s.patient_name && s.patient_name.toUpperCase().trim() === pat.name.toUpperCase().trim()) {
        console.log(`  EyerCloud (download_state): birthday="${s.birthday}"`);
        found = true;
        break;
      }
    }

    if (!found) console.log(`  NOT found in EyerCloud data`);
    console.log('');
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
