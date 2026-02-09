const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const state = require('./eyercloud_downloader/download_state.json');
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');

async function findMissingImages() {
  try {
    const examEntries = Object.entries(state.exam_details || {}).map(([id, data]) => ({ exam_id: id, ...data }));

    console.log('=== Finding Missing Images ===\n');

    // Problem 1: Exams in download_state but not uploaded to Bytescale
    console.log('1. Exams downloaded but NOT uploaded to Bytescale:\n');
    const notUploaded = examEntries.filter(e => {
      const mappingEntry = Object.entries(mapping).find(([key, val]) => val.exam_id === e.exam_id);
      return !mappingEntry && e.expected_images > 0;
    });
    console.log(`Found ${notUploaded.length} exams with missing uploads:\n`);
    notUploaded.forEach(e => {
      console.log(`  ${e.patient_name} - exam_id: ${e.exam_id}, expected: ${e.expected_images} images`);
    });

    // Problem 2: Exams in DB with fewer images than expected
    console.log('\n2. Exams in DB with fewer images than EyerCloud:\n');
    const allPatients = await prisma.patient.findMany({
      include: {
        exams: {
          include: {
            images: true
          }
        }
      }
    });

    const imageDiscrepancies = [];
    for (const patient of allPatients) {
      for (const exam of patient.exams) {
        if (!exam.eyerCloudId || exam.eyerCloudId.startsWith('cml')) continue;

        const stateExam = examEntries.find(e => e.exam_id === exam.eyerCloudId);
        if (stateExam) {
          const expected = stateExam.image_details
            ? stateExam.image_details.filter(img => img.type === 'COLOR' || img.type === 'ANTERIOR').length
            : Math.floor(stateExam.expected_images * 0.59); // Approx COLOR+ANTERIOR (59% of total)

          const actual = exam.images.length;

          if (actual < expected) {
            imageDiscrepancies.push({
              patient: patient.name,
              examId: exam.id,
              eyerCloudId: exam.eyerCloudId,
              expected,
              actual,
              missing: expected - actual
            });
          }
        }
      }
    }

    imageDiscrepancies.sort((a, b) => b.missing - a.missing);
    console.log(`Found ${imageDiscrepancies.length} exams with missing images:\n`);
    imageDiscrepancies.slice(0, 20).forEach(d => {
      console.log(`  ${d.patient} - expected: ${d.expected}, actual: ${d.actual}, missing: ${d.missing}`);
      console.log(`    eyerCloudId: ${d.eyerCloudId}`);
    });

    // Problem 3: Patients with multiple exams on same date (like Djalma)
    console.log('\n3. Patients with multiple exams on the same day:\n');
    const multiExamPatients = allPatients.filter(p => {
      const dates = p.exams.map(e => e.examDate?.toISOString().split('T')[0]);
      const uniqueDates = new Set(dates);
      return dates.length > uniqueDates.size;
    });

    console.log(`Found ${multiExamPatients.length} patients:\n`);
    multiExamPatients.forEach(p => {
      console.log(`  ${p.name}:`);
      p.exams.forEach(e => {
        const time = e.examDate ? new Date(e.examDate).toLocaleTimeString() : 'unknown';
        console.log(`    - ${e.examDate?.toISOString().split('T')[0]} ${time}, ${e.images.length} images, eyerCloudId: ${e.eyerCloudId}`);
      });
    });

    // Problem 4: Patients in download_state but not in DB
    console.log('\n4. Patients in download_state but NOT in DB:\n');
    const dbPatientNames = new Set(allPatients.map(p => p.name.toUpperCase().trim()));
    const missingPatients = examEntries.filter(e => {
      const name = e.patient_name?.toUpperCase().trim();
      return name && !dbPatientNames.has(name);
    });

    console.log(`Found ${missingPatients.length} patients:\n`);
    missingPatients.slice(0, 20).forEach(e => {
      console.log(`  ${e.patient_name} - exam_id: ${e.exam_id}, expected_images: ${e.expected_images}`);
    });

  } finally {
    await prisma.$disconnect();
  }
}

findMissingImages().catch(console.error);
