/**
 * fix_all_data_issues.js - Comprehensive data fix
 *
 * Fixes:
 * 1. CPFs: Replace wrong CPFs with correct ones from patient_details.json.
 *    Null out CPFs that have no EyerCloud source.
 * 2. Birth dates: Keep dates from EyerCloud. Null out dates that exist only in DB
 *    and not in EyerCloud (they were cross-contaminated).
 * 3. selectedImages: Resolve old-style IDs (examId-N, cml...-N) to new img-UUID.jpg format.
 *    Skip out-of-range indexes (mark as unresolvable).
 *
 * LOCK: Patients from ADEMILSON...CESAR (alphabetically) - DO NOT touch their reports.
 *
 * Usage:
 *   node scripts/fix_all_data_issues.js              # Preview
 *   node scripts/fix_all_data_issues.js --execute    # Apply
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Define locked patients: alphabetically ADEMILSON...CESAR (inclusive)
function isLocked(name) {
  const norm = normalize(name);
  return norm >= 'ADEMILSON' && norm < 'CESARD';
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'PREVIEW'}\n`);

  // Load EyerCloud sources
  const patientDetails = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/patient_details.json', 'utf-8'));

  // Build name -> EyerCloud data
  const eyerByNormName = {};
  for (const [pid, pdata] of Object.entries(patientDetails)) {
    const name = pdata.fullName || pdata.name;
    if (!name) continue;
    const norm = normalize(name);
    const existing = eyerByNormName[norm];
    if (!existing) {
      eyerByNormName[norm] = pdata;
    } else {
      // Keep the one with more data
      const newScore = (pdata.cpf ? 1 : 0) + (pdata.gender ? 1 : 0) + (pdata.birthday ? 1 : 0);
      const oldScore = (existing.cpf ? 1 : 0) + (existing.gender ? 1 : 0) + (existing.birthday ? 1 : 0);
      if (newScore > oldScore) eyerByNormName[norm] = pdata;
    }
  }

  // Load all patients with exams, images, reports
  const allPatients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: true
        }
      }
    }
  });

  console.log(`Total patients: ${allPatients.length}`);
  console.log(`Locked patients (ADEMILSON...CESAR): ${allPatients.filter(p => isLocked(p.name)).length}`);
  console.log();

  // ================================================================
  // PHASE 1: Fix CPFs
  // ================================================================
  console.log('='.repeat(60));
  console.log('PHASE 1: FIX CPFs');
  console.log('='.repeat(60));

  let cpfCorrected = 0;
  let cpfNulled = 0;
  let cpfUnchanged = 0;

  for (const pat of allPatients) {
    const norm = normalize(pat.name);
    const eyerData = eyerByNormName[norm];
    const dbCpf = (pat.cpf || '').replace(/\D/g, '');
    const eyerCpf = (eyerData?.cpf || '').replace(/\D/g, '');

    if (!dbCpf && !eyerCpf) { cpfUnchanged++; continue; }

    // Case 1: DB CPF matches EyerCloud - OK
    if (dbCpf && eyerCpf && dbCpf === eyerCpf) { cpfUnchanged++; continue; }

    // Case 2: DB has CPF but EyerCloud doesn't - null it out (phantom data)
    if (dbCpf && !eyerCpf) {
      console.log(`  NULL CPF: ${pat.name} (was: ${pat.cpf})`);
      cpfNulled++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { cpf: null } });
      }
      continue;
    }

    // Case 3: DB has wrong CPF, EyerCloud has correct one
    if (dbCpf && eyerCpf && dbCpf !== eyerCpf) {
      console.log(`  CORRECT CPF: ${pat.name} (${pat.cpf} -> ${eyerData.cpf})`);
      cpfCorrected++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { cpf: eyerData.cpf } });
      }
      continue;
    }

    // Case 4: DB has no CPF but EyerCloud does - set it
    if (!dbCpf && eyerCpf) {
      console.log(`  SET CPF: ${pat.name} (null -> ${eyerData.cpf})`);
      cpfCorrected++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { cpf: eyerData.cpf } });
      }
      continue;
    }

    cpfUnchanged++;
  }

  console.log(`\nCPF Summary: ${cpfCorrected} corrected, ${cpfNulled} nulled, ${cpfUnchanged} unchanged`);

  // ================================================================
  // PHASE 2: Fix Birth Dates
  // ================================================================
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 2: FIX BIRTH DATES');
  console.log('='.repeat(60));

  let birthCorrected = 0;
  let birthNulled = 0;
  let birthUnchanged = 0;

  for (const pat of allPatients) {
    const norm = normalize(pat.name);
    const eyerData = eyerByNormName[norm];
    const dbBirth = pat.birthDate;
    const eyerBirthStr = eyerData?.birthday || '';
    const eyerBirth = eyerBirthStr ? new Date(eyerBirthStr) : null;

    // Skip if both null
    if (!dbBirth && !eyerBirth) { birthUnchanged++; continue; }

    // If DB has date and EyerCloud has date, check match
    if (dbBirth && eyerBirth) {
      const dbStr = dbBirth.toISOString().slice(0, 10);
      const eyerStr = eyerBirth.toISOString().slice(0, 10);
      if (dbStr === eyerStr) { birthUnchanged++; continue; }

      // Mismatch - trust EyerCloud
      console.log(`  CORRECT BIRTH: ${pat.name} (${dbStr} -> ${eyerStr})`);
      birthCorrected++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { birthDate: eyerBirth } });
      }
      continue;
    }

    // DB has date but EyerCloud doesn't - null it (phantom data)
    if (dbBirth && !eyerBirth) {
      console.log(`  NULL BIRTH: ${pat.name} (was: ${dbBirth.toISOString().slice(0, 10)})`);
      birthNulled++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { birthDate: null } });
      }
      continue;
    }

    // DB doesn't have date but EyerCloud does - set it
    if (!dbBirth && eyerBirth) {
      console.log(`  SET BIRTH: ${pat.name} (null -> ${eyerBirth.toISOString().slice(0, 10)})`);
      birthCorrected++;
      if (EXECUTE) {
        await prisma.patient.update({ where: { id: pat.id }, data: { birthDate: eyerBirth } });
      }
      continue;
    }

    birthUnchanged++;
  }

  console.log(`\nBirth Summary: ${birthCorrected} corrected, ${birthNulled} nulled, ${birthUnchanged} unchanged`);

  // ================================================================
  // PHASE 3: Fix selectedImages in reports
  // ================================================================
  console.log('\n' + '='.repeat(60));
  console.log('PHASE 3: FIX selectedImages IN REPORTS');
  console.log('='.repeat(60));

  let siFixed = 0;
  let siSkippedLocked = 0;
  let siSkippedOk = 0;
  let siUnresolvable = 0;
  const unresolvableList = [];

  for (const pat of allPatients) {
    const locked = isLocked(pat.name);

    for (const exam of pat.exams) {
      if (!exam.report || !exam.report.selectedImages) continue;

      const si = exam.report.selectedImages;
      let selectedMap; // { od: "id", oe: "id" }

      if (typeof si === 'object' && !Array.isArray(si)) {
        selectedMap = si;
      } else if (typeof si === 'string') {
        try { selectedMap = JSON.parse(si); } catch { continue; }
      } else {
        continue;
      }

      const examImageIds = new Set(exam.images.map(i => i.id));
      let needsUpdate = false;
      const newMap = { ...selectedMap };
      let hasUnresolvable = false;

      for (const eye of ['od', 'oe']) {
        const oldId = selectedMap[eye];
        if (!oldId) continue;

        // Already resolved to current format?
        if (examImageIds.has(oldId)) continue;

        // Try index-based resolution
        const indexMatch = oldId.match(/-(\d+)$/);
        if (indexMatch) {
          const idx = parseInt(indexMatch[1]);
          if (idx < exam.images.length) {
            newMap[eye] = exam.images[idx].id;
            needsUpdate = true;
          } else {
            // Out of range - unresolvable
            hasUnresolvable = true;
            newMap[eye] = null; // Mark as lost
            needsUpdate = true;
          }
        } else {
          // No index pattern (e.g. cml... without -N) - unresolvable
          hasUnresolvable = true;
          // Leave as-is for now, the UI resolveImage() handles fallback
        }
      }

      if (needsUpdate) {
        if (locked) {
          console.log(`  SKIP (LOCKED): ${pat.name} - ${exam.id}`);
          siSkippedLocked++;
          continue;
        }

        if (hasUnresolvable) {
          siUnresolvable++;
          unresolvableList.push({
            patient: pat.name,
            examId: exam.id,
            oldSi: selectedMap,
            newSi: newMap,
            imageCount: exam.images.length
          });
        }

        console.log(`  FIX: ${pat.name} (${exam.id})`);
        console.log(`    old: ${JSON.stringify(selectedMap)}`);
        console.log(`    new: ${JSON.stringify(newMap)}`);
        siFixed++;

        if (EXECUTE) {
          await prisma.medicalReport.update({
            where: { id: exam.report.id },
            data: { selectedImages: newMap }
          });
        }
      } else {
        siSkippedOk++;
      }
    }
  }

  console.log(`\nselectedImages Summary: ${siFixed} fixed, ${siSkippedOk} already OK, ${siSkippedLocked} skipped (locked)`);
  console.log(`Unresolvable (out of range or no index): ${siUnresolvable}`);

  if (unresolvableList.length > 0) {
    console.log('\nUnresolvable reports (need manual review):');
    for (const u of unresolvableList) {
      console.log(`  ${u.patient} (${u.examId}): ${JSON.stringify(u.oldSi)} -> ${JSON.stringify(u.newSi)} (${u.imageCount} images)`);
    }
  }

  // ================================================================
  // FINAL SUMMARY
  // ================================================================
  console.log('\n' + '='.repeat(60));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(60));
  console.log(`CPF: ${cpfCorrected} corrected, ${cpfNulled} nulled`);
  console.log(`BirthDate: ${birthCorrected} corrected, ${birthNulled} nulled`);
  console.log(`selectedImages: ${siFixed} fixed, ${siSkippedLocked} skipped (locked)`);

  if (!EXECUTE) {
    console.log('\nRun with --execute to apply all changes.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
