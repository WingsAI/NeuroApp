/**
 * fix_diseases.js - Sync underlying/ophthalmic diseases from download_state.json to DB
 *
 * The original sync imported all diseases as false. This script updates
 * patients with the real disease data from the EyerCloud API.
 *
 * Usage:
 *   node scripts/fix_diseases.js              # Preview
 *   node scripts/fix_diseases.js --execute    # Apply
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const execute = process.argv.includes('--execute');
console.log(execute ? '=== EXECUTE ===' : '=== PREVIEW ===');

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  const state = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader', 'download_state.json'), 'utf8'));

  // Build disease map: normalized name -> diseases (first exam wins)
  const diseaseMap = {};
  for (const [examId, detail] of Object.entries(state.exam_details)) {
    const name = detail.patient_name;
    if (!name) continue;
    const norm = normalize(name);

    const ud = detail.underlying_diseases || {};
    const od = detail.ophthalmic_diseases || {};

    // Only store if not already set (first exam wins)
    if (!diseaseMap[norm]) {
      diseaseMap[norm] = { underlying: ud, ophthalmic: od, name };
    }
  }

  // Get all patients from DB
  const patients = await prisma.patient.findMany({
    select: { id: true, name: true, underlyingDiseases: true, ophthalmicDiseases: true }
  });

  let updated = 0;
  let unchanged = 0;
  let notInState = 0;

  for (const pat of patients) {
    const norm = normalize(pat.name);
    const stateData = diseaseMap[norm];

    if (!stateData) {
      notInState++;
      continue;
    }

    // Compare: check if state has different/better data than DB
    const dbUd = pat.underlyingDiseases || {};
    const dbOd = pat.ophthalmicDiseases || {};
    const stateUd = stateData.underlying;
    const stateOd = stateData.ophthalmic;

    // Check if any disease in state is true but false in DB
    let needsUpdate = false;
    for (const [key, val] of Object.entries(stateUd)) {
      if (val === true && dbUd[key] !== true) needsUpdate = true;
    }
    for (const [key, val] of Object.entries(stateOd)) {
      if (val === true && dbOd[key] !== true) needsUpdate = true;
    }

    if (!needsUpdate) {
      unchanged++;
      continue;
    }

    // Merge: keep existing true values, add new true values from state
    const mergedUd = { ...dbUd };
    for (const [key, val] of Object.entries(stateUd)) {
      if (val === true) mergedUd[key] = true;
    }
    const mergedOd = { ...dbOd };
    for (const [key, val] of Object.entries(stateOd)) {
      if (val === true) mergedOd[key] = true;
    }

    const changes = [];
    for (const [key, val] of Object.entries(mergedUd)) {
      if (val === true && dbUd[key] !== true) changes.push(`underlying.${key}`);
    }
    for (const [key, val] of Object.entries(mergedOd)) {
      if (val === true && dbOd[key] !== true) changes.push(`ophthalmic.${key}`);
    }

    console.log(`  UPDATE: ${pat.name} -> +${changes.join(', ')}`);

    if (execute) {
      await prisma.patient.update({
        where: { id: pat.id },
        data: {
          underlyingDiseases: mergedUd,
          ophthalmicDiseases: mergedOd,
          updatedAt: new Date()
        }
      });
    }

    updated++;
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Not in state: ${notInState}`);
  console.log(`Total patients: ${patients.length}`);

  if (!execute && updated > 0) {
    console.log(`\nRun with --execute to apply ${updated} updates`);
  }

  await prisma.$disconnect();
}

main();
