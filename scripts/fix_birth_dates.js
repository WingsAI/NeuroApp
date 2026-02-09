const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const state = require('./eyercloud_downloader/download_state.json');

const PREVIEW = !process.argv.includes('--execute');

async function fixBirthDates() {
  console.log('=== Fix Birth Dates ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  try {
    const patients = await prisma.patient.findMany({
      include: {
        exams: true
      }
    });

    const examEntries = Object.entries(state.exam_details).map(([id, data]) => ({ exam_id: id, ...data }));

    let totalMismatches = 0;
    let totalMissingInDb = 0;
    let totalMissingInState = 0;
    let totalFixed = 0;

    for (const patient of patients) {
      // Get all eyerCloud exams for this patient
      const eyerCloudExams = patient.exams.filter(e => e.eyerCloudId && !e.eyerCloudId.startsWith('cml'));

      if (eyerCloudExams.length === 0) continue;

      // Get birth date from EyerCloud state (use first exam)
      const firstExam = eyerCloudExams[0];
      const stateExam = examEntries.find(e => e.exam_id === firstExam.eyerCloudId);

      if (!stateExam) continue;

      const stateBirthDate = stateExam.patient_birth_date ? stateExam.patient_birth_date.split('T')[0] : null;
      const dbBirthDate = patient.birthDate ? patient.birthDate.toISOString().split('T')[0] : null;

      // Check for issues
      if (!dbBirthDate && stateBirthDate) {
        totalMissingInDb++;
        console.log(`\nPatient: ${patient.name} (ID: ${patient.id})`);
        console.log(`  DB birth date: MISSING`);
        console.log(`  EyerCloud birth date: ${stateBirthDate}`);

        if (!PREVIEW) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: { birthDate: new Date(stateBirthDate) }
          });
          totalFixed++;
          console.log(`  ✓ Updated to ${stateBirthDate}`);
        }
      } else if (dbBirthDate && !stateBirthDate) {
        totalMissingInState++;
        console.log(`\nPatient: ${patient.name} (ID: ${patient.id})`);
        console.log(`  DB birth date: ${dbBirthDate}`);
        console.log(`  EyerCloud birth date: MISSING (keeping DB value)`);
      } else if (dbBirthDate && stateBirthDate && dbBirthDate !== stateBirthDate) {
        totalMismatches++;
        console.log(`\nPatient: ${patient.name} (ID: ${patient.id})`);
        console.log(`  DB birth date: ${dbBirthDate}`);
        console.log(`  EyerCloud birth date: ${stateBirthDate}`);

        // Decide which one to keep (EyerCloud is source of truth)
        if (!PREVIEW) {
          await prisma.patient.update({
            where: { id: patient.id },
            data: { birthDate: new Date(stateBirthDate) }
          });
          totalFixed++;
          console.log(`  ✓ Updated to EyerCloud date: ${stateBirthDate}`);
        } else {
          console.log(`  Would update to EyerCloud date: ${stateBirthDate}`);
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Missing in DB: ${totalMissingInDb}`);
    console.log(`Missing in EyerCloud: ${totalMissingInState}`);
    console.log(`Mismatches: ${totalMismatches}`);
    console.log(`Total issues: ${totalMissingInDb + totalMismatches}`);

    if (!PREVIEW) {
      console.log(`Total fixed: ${totalFixed}`);
    } else {
      console.log('\nRun with --execute to apply changes');
    }

  } finally {
    await prisma.$disconnect();
  }
}

fixBirthDates().catch(console.error);
