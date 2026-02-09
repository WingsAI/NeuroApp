const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const PREVIEW = !process.argv.includes('--execute');

async function fixNullBirthDates() {
  console.log('=== Fix Null Birth Dates ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  try {
    // Load download_state.json
    const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

    // Get all patients with null birth dates
    const patientsWithNullBirthDate = await prisma.patient.findMany({
      where: {
        birthDate: null
      },
      orderBy: { name: 'asc' }
    });

    console.log(`Found ${patientsWithNullBirthDate.length} patients with null birth dates\n`);

    if (patientsWithNullBirthDate.length === 0) {
      console.log('No patients with null birth dates found.');
      return;
    }

    // Convert exam_details to array for easier searching
    const examDetailsArray = Object.entries(state.exam_details).map(([exam_id, data]) => ({
      exam_id,
      ...data
    }));

    const fixable = [];
    const unfixable = [];

    for (const patient of patientsWithNullBirthDate) {
      // Normalize patient name for matching
      const normalizedName = patient.name
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      // Find matching exam in download_state by normalized name
      const matchingExam = examDetailsArray.find(exam => {
        if (!exam.patient_name) return false;
        const examName = exam.patient_name
          .toUpperCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
        return examName === normalizedName;
      });

      if (matchingExam) {
        // Check for birth date in various possible fields
        const birthDateStr = matchingExam.patient_birth_date ||
                            matchingExam.birthday ||
                            matchingExam.birthDate;

        if (birthDateStr && birthDateStr !== 'N/A' && birthDateStr !== '') {
          // Try to parse the birth date
          let parsedDate = null;

          try {
            // Handle various date formats
            // ISO format: YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}/.test(birthDateStr)) {
              parsedDate = new Date(birthDateStr);
            }
            // DD/MM/YYYY format
            else if (/^\d{2}\/\d{2}\/\d{4}/.test(birthDateStr)) {
              const [day, month, year] = birthDateStr.split('/');
              parsedDate = new Date(`${year}-${month}-${day}`);
            }

            if (parsedDate && !isNaN(parsedDate.getTime())) {
              fixable.push({
                patient,
                birthDate: parsedDate,
                birthDateStr,
                examId: matchingExam.exam_id
              });
            } else {
              unfixable.push({
                patient,
                reason: `Invalid date format: ${birthDateStr}`,
                examId: matchingExam.exam_id
              });
            }
          } catch (e) {
            unfixable.push({
              patient,
              reason: `Parse error: ${birthDateStr}`,
              examId: matchingExam.exam_id
            });
          }
        } else {
          unfixable.push({
            patient,
            reason: 'No birth date in download_state',
            examId: matchingExam.exam_id
          });
        }
      } else {
        unfixable.push({
          patient,
          reason: 'Patient not found in download_state',
          examId: null
        });
      }
    }

    console.log('=== FIXABLE PATIENTS ===');
    console.log(`${fixable.length} patients have birth dates available in download_state:\n`);

    for (let i = 0; i < fixable.length; i++) {
      const { patient, birthDate, birthDateStr, examId } = fixable[i];
      console.log(`${i + 1}. ${patient.name}`);
      console.log(`   Patient ID: ${patient.id}`);
      console.log(`   Exam ID: ${examId}`);
      console.log(`   Birth date: ${birthDateStr} -> ${birthDate.toISOString().split('T')[0]}`);

      if (!PREVIEW) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: { birthDate }
        });
        console.log(`   ✓ Updated`);
      } else {
        console.log(`   Would update to ${birthDate.toISOString().split('T')[0]}`);
      }
      console.log();
    }

    console.log('\n=== UNFIXABLE PATIENTS ===');
    console.log(`${unfixable.length} patients need manual birth date entry from EyerCloud UI:\n`);

    for (let i = 0; i < unfixable.length; i++) {
      const { patient, reason, examId } = unfixable[i];
      console.log(`${i + 1}. ${patient.name}`);
      console.log(`   Patient ID: ${patient.id}`);
      console.log(`   Exam ID: ${examId || 'NOT FOUND'}`);
      console.log(`   Reason: ${reason}`);
      console.log();
    }

    console.log('\n=== SUMMARY ===');
    console.log(`Total patients with null birth dates: ${patientsWithNullBirthDate.length}`);
    console.log(`Fixable (have data in download_state): ${fixable.length}`);
    console.log(`Unfixable (need manual entry): ${unfixable.length}`);

    if (PREVIEW && fixable.length > 0) {
      console.log(`\nRun with --execute to apply ${fixable.length} updates`);
    } else if (!PREVIEW && fixable.length > 0) {
      console.log(`\n✓ Updated ${fixable.length} patients`);
    }

  } finally {
    await prisma.$disconnect();
  }
}

fixNullBirthDates().catch(console.error);
