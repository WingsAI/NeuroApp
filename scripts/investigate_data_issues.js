const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const patientDetails = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/patient_details.json', 'utf-8'));
  const downloadState = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf-8'));

  // Build name -> eyer data
  const eyerByName = {};
  for (const [pid, pdata] of Object.entries(patientDetails)) {
    const name = pdata.fullName?.toUpperCase().trim();
    if (name) eyerByName[name] = { ...pdata, eyerId: pid };
  }

  // ============================================================
  // ISSUE 1: CPFs in DB that don't exist in EyerCloud
  // These must have come from manual entry on the medical page
  // ============================================================
  console.log('=' .repeat(70));
  console.log('ISSUE 1: CPF SOURCE ANALYSIS');
  console.log('=' .repeat(70));

  const allPatients = await prisma.patient.findMany({
    include: {
      exams: {
        include: { report: { select: { id: true } } }
      }
    }
  });

  // Check how many CPFs could have come from patient_details vs manual entry
  let fromEyer = 0;
  let manualEntry = 0;
  let noReportButCpf = 0;
  const manualCpfPatients = [];

  for (const pat of allPatients) {
    if (!pat.cpf) continue;
    const eyerData = eyerByName[pat.name.toUpperCase().trim()];
    const eyerCpf = eyerData?.cpf?.replace(/\D/g, '') || '';
    const dbCpf = pat.cpf.replace(/\D/g, '');

    if (eyerCpf && eyerCpf === dbCpf) {
      fromEyer++;
    } else {
      manualEntry++;
      const hasReport = pat.exams.some(e => e.report);
      if (!hasReport) noReportButCpf++;
      manualCpfPatients.push({
        name: pat.name,
        cpf: pat.cpf,
        eyerCpf: eyerCpf || '(none)',
        hasReport
      });
    }
  }

  console.log(`CPFs matching EyerCloud: ${fromEyer}`);
  console.log(`CPFs NOT in EyerCloud (manual entry): ${manualEntry}`);
  console.log(`  Of those, without report: ${noReportButCpf}`);
  console.log(`  Of those, with report: ${manualEntry - noReportButCpf}`);
  console.log();

  // ============================================================
  // ISSUE 2: Specific patients with wrong CPF
  // ============================================================
  console.log('=' .repeat(70));
  console.log('ISSUE 2: APARECIDO TERUEL & BASILIA LINO DA SILVA - CPF CHECK');
  console.log('=' .repeat(70));

  for (const searchName of ['APARECIDO TERUEL', 'BASILIA LINO']) {
    const pat = allPatients.find(p => p.name.toUpperCase().includes(searchName));
    if (pat) {
      const eyerData = eyerByName[pat.name.toUpperCase().trim()];
      console.log(`\n${pat.name}:`);
      console.log(`  DB CPF: ${pat.cpf || '(null)'}`);
      console.log(`  Eyer CPF: ${eyerData?.cpf || '(none in eyer)'}`);
      console.log(`  DB birthDate: ${pat.birthDate}`);
      console.log(`  Eyer birthday: ${eyerData?.birthday || '(none)'}`);
      console.log(`  Has reports: ${pat.exams.some(e => e.report)}`);

      // Check if this CPF belongs to someone else in the DB
      if (pat.cpf) {
        const othersWithSameCpf = allPatients.filter(
          p => p.cpf?.replace(/\D/g, '') === pat.cpf.replace(/\D/g, '') && p.id !== pat.id
        );
        if (othersWithSameCpf.length > 0) {
          console.log(`  !!! SAME CPF found in other patients:`);
          othersWithSameCpf.forEach(o => console.log(`      ${o.name} (id: ${o.id})`));
        }

        // Check if this CPF belongs to someone else in EyerCloud
        for (const [pid, pdata] of Object.entries(patientDetails)) {
          if (pdata.cpf?.replace(/\D/g, '') === pat.cpf.replace(/\D/g, '') && pdata.fullName?.toUpperCase().trim() !== pat.name.toUpperCase().trim()) {
            console.log(`  !!! CPF belongs to different EyerCloud patient: ${pdata.fullName}`);
          }
        }
      }
    }
  }

  // ============================================================
  // ISSUE 3: APARECIDA DA SILVA - birthDate in DB but not in EyerCloud
  // ============================================================
  console.log('\n' + '=' .repeat(70));
  console.log('ISSUE 3: APARECIDA DA SILVA - BIRTH DATE CHECK');
  console.log('=' .repeat(70));

  const aparecidas = allPatients.filter(p => {
    const n = p.name.toUpperCase();
    return n === 'APARECIDA DA SILVA' || (n.includes('APARECIDA DA SILVA') && !n.includes('CLAUDINEIA') && !n.includes('SANTOS'));
  });

  for (const pat of aparecidas) {
    const eyerData = eyerByName[pat.name.toUpperCase().trim()];
    console.log(`\n${pat.name} (id: ${pat.id}):`);
    console.log(`  DB birthDate: ${pat.birthDate}`);
    console.log(`  Eyer birthday: ${eyerData?.birthday || '(none)'}`);
    console.log(`  Has reports: ${pat.exams.some(e => e.report)}`);

    // Check download_state too
    for (const [eid, edata] of Object.entries(downloadState)) {
      if (edata.patient_name?.toUpperCase().trim() === pat.name.toUpperCase().trim()) {
        console.log(`  download_state exam ${eid}: birthday="${edata.birthday || '(empty)'}"`);
      }
    }
  }

  // ============================================================
  // BROADER: How many patients have birthDate in DB but not in EyerCloud?
  // ============================================================
  console.log('\n' + '=' .repeat(70));
  console.log('BROADER: BIRTH DATES IN DB BUT NOT IN EYERCLOUD');
  console.log('=' .repeat(70));

  let dbHasBirthEyerNot = 0;
  const birthProblems = [];
  for (const pat of allPatients) {
    if (!pat.birthDate) continue;
    const eyerData = eyerByName[pat.name.toUpperCase().trim()];
    const eyerBday = eyerData?.birthday || '';
    if (!eyerBday || eyerBday === '') {
      dbHasBirthEyerNot++;
      birthProblems.push({ name: pat.name, dbBirth: pat.birthDate, hasReport: pat.exams.some(e => e.report) });
    }
  }

  console.log(`Patients with birthDate in DB but not in EyerCloud: ${dbHasBirthEyerNot}`);
  if (birthProblems.length <= 30) {
    for (const bp of birthProblems) {
      console.log(`  ${bp.name}: DB=${bp.dbBirth?.toISOString().slice(0, 10)} hasReport=${bp.hasReport}`);
    }
  }

  // ============================================================
  // CPF CROSS-CONTAMINATION: Find patients whose CPF matches ANOTHER patient's CPF in EyerCloud
  // ============================================================
  console.log('\n' + '=' .repeat(70));
  console.log('CPF CROSS-CONTAMINATION: DB CPF matches a DIFFERENT patient in EyerCloud');
  console.log('=' .repeat(70));

  // Build cpf -> eyer patient name map
  const eyerCpfToName = {};
  for (const [pid, pdata] of Object.entries(patientDetails)) {
    if (pdata.cpf) {
      const cpfClean = pdata.cpf.replace(/\D/g, '');
      if (cpfClean) eyerCpfToName[cpfClean] = pdata.fullName;
    }
  }

  let crossContaminated = 0;
  for (const pat of allPatients) {
    if (!pat.cpf) continue;
    const dbCpf = pat.cpf.replace(/\D/g, '');
    const eyerOwner = eyerCpfToName[dbCpf];
    if (eyerOwner && eyerOwner.toUpperCase().trim() !== pat.name.toUpperCase().trim()) {
      crossContaminated++;
      console.log(`  ${pat.name}: CPF ${pat.cpf} belongs to ${eyerOwner} in EyerCloud!`);
    }
  }
  console.log(`Total cross-contaminated: ${crossContaminated}`);

  // ============================================================
  // DUPLICATE CPFs IN DB
  // ============================================================
  console.log('\n' + '=' .repeat(70));
  console.log('DUPLICATE CPFs IN DB');
  console.log('=' .repeat(70));

  const cpfCounts = {};
  for (const pat of allPatients) {
    if (!pat.cpf) continue;
    const cpf = pat.cpf.replace(/\D/g, '');
    if (!cpfCounts[cpf]) cpfCounts[cpf] = [];
    cpfCounts[cpf].push(pat.name);
  }

  let dupeCount = 0;
  for (const [cpf, names] of Object.entries(cpfCounts)) {
    if (names.length > 1) {
      dupeCount++;
      console.log(`  CPF ${cpf}: ${names.join(', ')}`);
    }
  }
  console.log(`Total duplicate CPFs: ${dupeCount}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
