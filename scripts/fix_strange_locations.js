const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const PREVIEW = !process.argv.includes('--execute');

// Clinic ID to name mapping
const CLINIC_ID_MAP = {
  '695e434f28b781ee6000d862': 'Campos do Jordão-SP'
};

async function fixStrangeLocations() {
  console.log('=== Fix Strange Locations ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  // Load download_state
  const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

  // Find all exams - we'll filter in JS
  const exams = await prisma.exam.findMany({
    include: {
      patient: {
        select: { name: true }
      }
    }
  });

  // Filter for exams with ID-like locations or null
  const affectedExams = exams.filter(e =>
    (e.location && CLINIC_ID_MAP[e.location]) || !e.location
  );

  console.log(`Found ${affectedExams.length} exams with strange locations\n`);

  let fixedCount = 0;
  let notFoundCount = 0;

  for (const exam of affectedExams) {
    let correctLocation = null;

    // Check if location is a known clinic ID
    if (exam.location && CLINIC_ID_MAP[exam.location]) {
      correctLocation = CLINIC_ID_MAP[exam.location];
    } else if (!exam.location) {
      // Try to find in download_state
      const examData = state.exam_details[exam.eyerCloudId];
      if (examData && examData.clinic_name) {
        // Check if clinic_name is an ID
        if (CLINIC_ID_MAP[examData.clinic_name]) {
          correctLocation = CLINIC_ID_MAP[examData.clinic_name];
        } else {
          correctLocation = examData.clinic_name;
        }
      }
    }

    if (correctLocation && correctLocation !== exam.location) {
      console.log(`${exam.patient.name}`);
      console.log(`  Current: ${exam.location || 'NULL'}`);
      console.log(`  Correct: ${correctLocation}`);

      if (!PREVIEW) {
        await prisma.exam.update({
          where: { id: exam.id },
          data: { location: correctLocation }
        });
        console.log(`  ✓ Updated`);
      } else {
        console.log(`  Would update`);
      }
      console.log();

      fixedCount++;
    } else if (!correctLocation) {
      console.log(`⚠ ${exam.patient.name}: eyerCloudId ${exam.eyerCloudId} - no location found`);
      notFoundCount++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total exams checked: ${affectedExams.length}`);
  console.log(`Fixed: ${fixedCount}`);
  console.log(`Not found: ${notFoundCount}`);

  if (PREVIEW && fixedCount > 0) {
    console.log(`\nRun with --execute to apply ${fixedCount} updates`);
  } else if (!PREVIEW && fixedCount > 0) {
    console.log(`\n✓ Updated ${fixedCount} exams`);
  }

  await prisma.$disconnect();
}

fixStrangeLocations().catch(console.error);
