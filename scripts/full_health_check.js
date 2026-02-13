/**
 * full_health_check.js - Complete database health check
 *
 * Checks:
 * 1. Misplaced images (URL owner != DB patient)
 * 2. Broken selectedImages in reports
 * 3. Duplicate CPFs
 * 4. Phantom CPFs (not in EyerCloud)
 * 5. Short IDs (< 24 chars)
 * 6. REDFREE images
 * 7. Exams with 0 images
 * 8. General stats
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== FULL HEALTH CHECK ===\n');

  // Load patient_details.json for CPF verification
  const detailsPath = path.join(__dirname, 'eyercloud_downloader', 'patient_details.json');
  let patientDetails = {};
  if (fs.existsSync(detailsPath)) {
    const details = JSON.parse(fs.readFileSync(detailsPath, 'utf-8'));
    for (const [id, d] of Object.entries(details)) {
      const norm = normalize(d.fullName || '');
      patientDetails[norm] = d;
    }
  }

  const patients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: { select: { id: true, selectedImages: true } }
        }
      }
    }
  });

  const stats = {
    patients: patients.length,
    exams: 0,
    images: 0,
    reports: 0,
    misplacedImages: 0,
    brokenSelectedImages: 0,
    duplicateCpfs: 0,
    phantomCpfs: 0,
    shortIds: 0,
    redfreeImages: 0,
    examsNoImages: 0,
    patientsWithCpf: 0,
    patientsWithBirthDate: 0,
  };

  const issues = [];
  const cpfMap = {};

  for (const pat of patients) {
    const patNorm = normalize(pat.name);

    // CPF checks
    if (pat.cpf) {
      stats.patientsWithCpf++;
      if (!cpfMap[pat.cpf]) cpfMap[pat.cpf] = [];
      cpfMap[pat.cpf].push(pat.name);

      // Check against EyerCloud
      const detail = patientDetails[patNorm];
      if (detail) {
        if (detail.cpf && detail.cpf !== pat.cpf) {
          issues.push(`CPF MISMATCH: ${pat.name} - DB: ${pat.cpf}, EyerCloud: ${detail.cpf}`);
        }
      } else {
        // Not in patient_details - phantom?
        stats.phantomCpfs++;
      }
    }

    if (pat.birthDate) stats.patientsWithBirthDate++;

    // Short ID check
    if (pat.id.length < 24 && !pat.id.startsWith('manual-') && !pat.id.startsWith('cml')) {
      stats.shortIds++;
      issues.push(`SHORT ID: ${pat.name} (${pat.id})`);
    }

    for (const exam of pat.exams) {
      stats.exams++;

      if (exam.images.length === 0) {
        stats.examsNoImages++;
      }

      for (const img of exam.images) {
        stats.images++;

        // REDFREE check
        if (img.type === 'REDFREE') {
          stats.redfreeImages++;
        }

        // Misplaced image check
        if (img.url) {
          try {
            const url = decodeURIComponent(img.url);
            const m = url.match(/\/patients\/(.+?)_[a-f0-9]{8,24}\//i);
            if (m) {
              const urlName = normalize(m[1].replace(/_/g, ' '));
              if (urlName !== patNorm && !patNorm.includes(urlName) && !urlName.includes(patNorm)) {
                stats.misplacedImages++;
              }
            }
          } catch(e) {}
        }
      }

      // Report checks
      if (exam.report) {
        stats.reports++;
        const si = exam.report.selectedImages;
        if (si && typeof si === 'object') {
          const examImageIds = new Set(exam.images.map(i => i.id));
          for (const eye of ['od', 'oe']) {
            const id = si[eye];
            if (id && !examImageIds.has(id)) {
              stats.brokenSelectedImages++;
              issues.push(`BROKEN selectedImages: ${pat.name} (${exam.id}) ${eye}=${id}`);
              break; // Count per report, not per eye
            }
          }
        }
      }
    }
  }

  // Duplicate CPFs
  const dupes = Object.entries(cpfMap).filter(([, names]) => names.length > 1);
  stats.duplicateCpfs = dupes.length;

  // Print stats
  console.log('--- STATS ---');
  console.log(`Patients: ${stats.patients}`);
  console.log(`Exams: ${stats.exams}`);
  console.log(`Images: ${stats.images}`);
  console.log(`Reports: ${stats.reports}`);
  console.log(`Patients with CPF: ${stats.patientsWithCpf}`);
  console.log(`Patients with birthDate: ${stats.patientsWithBirthDate}`);

  console.log('\n--- ISSUES ---');
  console.log(`Misplaced images: ${stats.misplacedImages}`);
  console.log(`Broken selectedImages: ${stats.brokenSelectedImages}`);
  console.log(`Duplicate CPFs: ${stats.duplicateCpfs}`);
  console.log(`Phantom CPFs (not in EyerCloud details): ${stats.phantomCpfs}`);
  console.log(`Short patient IDs: ${stats.shortIds}`);
  console.log(`REDFREE images: ${stats.redfreeImages}`);
  console.log(`Exams with 0 images: ${stats.examsNoImages}`);

  if (issues.length > 0) {
    console.log('\n--- ISSUE DETAILS ---');
    issues.forEach(i => console.log(`  ${i}`));
  }

  if (dupes.length > 0) {
    console.log('\n--- DUPLICATE CPFS ---');
    dupes.forEach(([cpf, names]) => console.log(`  ${cpf}: ${names.join(', ')}`));
  }

  const allClear = stats.misplacedImages === 0 &&
    stats.brokenSelectedImages === 0 &&
    stats.duplicateCpfs === 0 &&
    stats.shortIds === 0 &&
    stats.redfreeImages === 0;

  console.log(`\n${allClear ? '✅ ALL CLEAR - No issues found!' : '⚠️ Issues detected - review above'}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
