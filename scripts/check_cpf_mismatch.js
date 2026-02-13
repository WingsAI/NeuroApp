const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  // Load EyerCloud patient details (source of truth for CPF)
  const patientDetails = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/patient_details.json', 'utf-8'));
  const downloadState = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));

  // Build eyercloud patient name -> CPF mapping
  // patient_details.json is keyed by EyerCloud patient ID
  const eyerCpfByName = {};
  for (const [pid, pdata] of Object.entries(patientDetails)) {
    const name = pdata.fullName?.toUpperCase().trim();
    if (name) {
      eyerCpfByName[name] = pdata.cpf || '';
    }
  }

  // Also check download_state for CPF
  const stateCpfByName = {};
  for (const [eid, edata] of Object.entries(downloadState)) {
    const name = edata.patient_name?.toUpperCase().trim();
    if (name) {
      stateCpfByName[name] = edata.cpf || '';
    }
  }

  // Get all DB patients with CPF
  const patients = await prisma.patient.findMany({
    where: { cpf: { not: null } },
    include: { exams: { select: { id: true, eyerCloudId: true } } }
  });

  console.log(`DB patients with CPF: ${patients.length}`);
  console.log(`EyerCloud patients in patient_details.json: ${Object.keys(patientDetails).length}`);
  console.log();

  // First, check Ana specifically
  console.log('=== ANA FERREIRA BELIZARIO ===');
  const ana = patients.find(p => p.name.toUpperCase().includes('ANA FERREIRA BELIZARIO'));
  if (ana) {
    console.log(`DB: name="${ana.name}" cpf="${ana.cpf}" id=${ana.id}`);
    const eyerCpf = eyerCpfByName[ana.name.toUpperCase().trim()];
    const stateCpf = stateCpfByName[ana.name.toUpperCase().trim()];
    console.log(`EyerCloud patient_details CPF: "${eyerCpf || 'NOT FOUND'}"`);
    console.log(`EyerCloud download_state CPF: "${stateCpf || 'NOT FOUND'}"`);

    // Search by partial name in patient_details
    for (const [pid, pdata] of Object.entries(patientDetails)) {
      if (pdata.fullName?.toUpperCase().includes('BELIZARIO') || pdata.fullName?.toUpperCase().includes('ANA FERREIRA')) {
        console.log(`  patient_details match: id=${pid} name="${pdata.fullName}" cpf="${pdata.cpf}" gender="${pdata.gender}"`);
      }
    }
  }
  console.log();

  // Now find ALL patients where DB has CPF but EyerCloud doesn't (or vice versa)
  let dbHasEyerNot = 0;
  let eyerHasDbNot = 0;
  let cpfMismatch = 0;
  const problemPatients = [];

  for (const patient of patients) {
    const normalizedName = patient.name.toUpperCase().trim();
    const dbCpf = patient.cpf?.replace(/\D/g, '') || '';
    const eyerCpf = (eyerCpfByName[normalizedName] || '').replace(/\D/g, '');

    if (dbCpf && !eyerCpf) {
      // DB has CPF but EyerCloud doesn't
      dbHasEyerNot++;
      problemPatients.push({
        name: patient.name,
        id: patient.id,
        dbCpf: patient.cpf,
        eyerCpf: '',
        issue: 'DB_HAS_EYER_NOT'
      });
    } else if (!dbCpf && eyerCpf) {
      eyerHasDbNot++;
    } else if (dbCpf && eyerCpf && dbCpf !== eyerCpf) {
      cpfMismatch++;
      problemPatients.push({
        name: patient.name,
        id: patient.id,
        dbCpf: patient.cpf,
        eyerCpf: eyerCpfByName[normalizedName],
        issue: 'MISMATCH'
      });
    }
  }

  // Also check patients without CPF in DB but with CPF in EyerCloud
  const allPatients = await prisma.patient.findMany();
  for (const patient of allPatients) {
    const normalizedName = patient.name.toUpperCase().trim();
    const dbCpf = patient.cpf?.replace(/\D/g, '') || '';
    const eyerCpf = (eyerCpfByName[normalizedName] || '').replace(/\D/g, '');
    if (!dbCpf && eyerCpf) {
      eyerHasDbNot++;
    }
  }

  console.log('=== SUMMARY ===');
  console.log(`DB has CPF, EyerCloud doesn't: ${dbHasEyerNot}`);
  console.log(`EyerCloud has CPF, DB doesn't: ${eyerHasDbNot}`);
  console.log(`CPF mismatch (both have, different): ${cpfMismatch}`);
  console.log();

  if (problemPatients.length > 0) {
    console.log('=== PATIENTS WITH DB CPF BUT NO EYERCLOUD CPF ===');
    const dbHasProblems = problemPatients.filter(p => p.issue === 'DB_HAS_EYER_NOT');
    for (const p of dbHasProblems) {
      console.log(`  ${p.name} | id=${p.id} | DB CPF: ${p.dbCpf}`);
    }

    const mismatches = problemPatients.filter(p => p.issue === 'MISMATCH');
    if (mismatches.length > 0) {
      console.log('\n=== CPF MISMATCHES ===');
      for (const p of mismatches) {
        console.log(`  ${p.name} | DB: ${p.dbCpf} | Eyer: ${p.eyerCpf}`);
      }
    }
  }

  // Now investigate WHERE those DB CPFs came from
  // Check if any CPF was set via the medical page (report signing)
  console.log('\n=== INVESTIGATING SOURCE OF DB CPFs ===');
  console.log('Checking which CPFs could have come from fix_cpf_gender.js vs medical page...');

  // The fix_cpf_gender.js script uses patient_details.json as source
  // If patient_details has no CPF for a patient, the CPF must have come from manual entry (medical page)
  const dbHasProblems = problemPatients.filter(p => p.issue === 'DB_HAS_EYER_NOT');
  for (const p of dbHasProblems) {
    // Check if download_state has CPF
    const stateCpf = stateCpfByName[p.name.toUpperCase().trim()] || '';
    // Check patient_details by searching all entries
    let detailsCpf = '';
    for (const [pid, pdata] of Object.entries(patientDetails)) {
      if (pdata.fullName?.toUpperCase().trim() === p.name.toUpperCase().trim()) {
        detailsCpf = pdata.cpf || '';
        break;
      }
    }
    console.log(`  ${p.name}: state_cpf="${stateCpf}" details_cpf="${detailsCpf}" db_cpf="${p.dbCpf}"`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
