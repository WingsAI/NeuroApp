const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const state = require('./eyercloud_downloader/download_state.json');
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');

async function diagnose() {
  try {
    console.log('=== NeuroApp Data Integrity Diagnosis ===\n');

    const patients = await prisma.patient.findMany({
      include: {
        exams: {
          include: {
            images: true,
            report: true
          }
        }
      }
    });

    const examEntries = Object.entries(state.exam_details).map(([id, data]) => ({ exam_id: id, ...data }));
    const mappingExamIds = new Set();
    Object.values(mapping).forEach(entry => {
      if (entry.exam_id) mappingExamIds.add(entry.exam_id);
    });

    // Problem 1: Exams with 0 images
    console.log('1. PATIENTS WITH ZERO IMAGES:\n');
    const noImages = patients.filter(p => p.exams.some(e => e.images.length === 0));
    console.log(`Found ${noImages.length} patients:\n`);
    noImages.slice(0, 15).forEach(p => {
      const zeroExams = p.exams.filter(e => e.images.length === 0);
      console.log(`  ${p.name}`);
      zeroExams.forEach(e => {
        const stateExam = examEntries.find(se => se.exam_id === e.eyerCloudId);
        const inMapping = mappingExamIds.has(e.eyerCloudId);
        const expected = stateExam?.expected_images || '?';
        console.log(`    exam: ${e.id}, eyerCloudId: ${e.eyerCloudId || 'none'}`);
        console.log(`    expected: ${expected}, in mapping: ${inMapping}`);
      });
    });

    // Problem 2: Duplicate exams (same eyerCloudId)
    console.log('\n2. DUPLICATE EXAMS (same eyerCloudId):\n');
    const duplicates = [];
    patients.forEach(p => {
      const eyerCloudIds = p.exams.map(e => e.eyerCloudId).filter(id => id && !id.startsWith('cml'));
      const uniqueIds = new Set(eyerCloudIds);
      if (eyerCloudIds.length > uniqueIds.size) {
        duplicates.push({
          patient: p.name,
          exams: p.exams.filter(e => e.eyerCloudId && !e.eyerCloudId.startsWith('cml'))
        });
      }
    });
    console.log(`Found ${duplicates.length} patients with duplicate exams:\n`);
    duplicates.slice(0, 10).forEach(d => {
      console.log(`  ${d.patient}:`);
      const grouped = {};
      d.exams.forEach(e => {
        if (!grouped[e.eyerCloudId]) grouped[e.eyerCloudId] = [];
        grouped[e.eyerCloudId].push(e);
      });
      Object.entries(grouped).forEach(([id, exams]) => {
        if (exams.length > 1) {
          console.log(`    ${id}: ${exams.length} exams, images: ${exams.map(e => e.images.length).join(', ')}`);
        }
      });
    });

    // Problem 3: Birth date mismatches
    console.log('\n3. BIRTH DATE INCONSISTENCIES:\n');
    const birthDateIssues = [];
    patients.forEach(p => {
      if (!p.birthDate) return;
      p.exams.forEach(e => {
        if (!e.eyerCloudId || e.eyerCloudId.startsWith('cml')) return;
        const stateExam = examEntries.find(se => se.exam_id === e.eyerCloudId);
        if (stateExam && stateExam.patient_birth_date) {
          const dbDate = p.birthDate.toISOString().split('T')[0];
          const stateDate = stateExam.patient_birth_date.split('T')[0];
          if (dbDate !== stateDate) {
            birthDateIssues.push({
              patient: p.name,
              dbDate,
              stateDate,
              examId: e.eyerCloudId
            });
          }
        }
      });
    });
    console.log(`Found ${birthDateIssues.length} patients with birth date mismatches:\n`);
    birthDateIssues.slice(0, 10).forEach(issue => {
      console.log(`  ${issue.patient}: DB=${issue.dbDate}, EyerCloud=${issue.stateDate}`);
    });

    // Problem 4: Images with broken URLs or missing data
    console.log('\n4. IMAGES WITH ISSUES:\n');
    let brokenImages = 0;
    let s3Images = 0;
    let bytescaleImages = 0;
    let unknownImages = 0;

    patients.forEach(p => {
      p.exams.forEach(e => {
        e.images.forEach(img => {
          if (!img.url || img.url === '') {
            brokenImages++;
          } else if (img.url.includes('s3.amazonaws.com') || img.url.includes('cloudfront.net')) {
            s3Images++;
          } else if (img.url.includes('bytescale') || img.url.includes('upcdn.io')) {
            bytescaleImages++;
          } else {
            unknownImages++;
          }
        });
      });
    });

    console.log(`  Total images in DB: ${s3Images + bytescaleImages + brokenImages + unknownImages}`);
    console.log(`  S3/CloudFront: ${s3Images}`);
    console.log(`  Bytescale: ${bytescaleImages}`);
    console.log(`  Broken/empty: ${brokenImages}`);
    console.log(`  Unknown source: ${unknownImages}`);

    // Problem 5: Patients in state but not in DB
    console.log('\n5. PATIENTS IN EYERCLOUD BUT NOT IN DB:\n');
    const dbPatientNames = new Set(patients.map(p => p.name.toUpperCase().trim()));
    const missingPatients = examEntries.filter(e => {
      const name = e.patient_name?.toUpperCase().trim();
      return name && !dbPatientNames.has(name);
    });
    console.log(`Found ${missingPatients.length} patients:\n`);
    missingPatients.slice(0, 15).forEach(e => {
      const inMapping = mappingExamIds.has(e.exam_id);
      console.log(`  ${e.patient_name} - exam: ${e.exam_id}, in mapping: ${inMapping}`);
    });

    // Summary
    console.log('\n=== SUMMARY ===\n');
    console.log(`Total patients in DB: ${patients.length}`);
    console.log(`Total exams in DB: ${patients.reduce((sum, p) => sum + p.exams.length, 0)}`);
    console.log(`Total exams in EyerCloud state: ${examEntries.length}`);
    console.log(`Total exams uploaded to Bytescale: ${mappingExamIds.size}`);
    console.log(`Exams NOT uploaded: ${examEntries.length - mappingExamIds.size}`);
    console.log('');
    console.log(`Patients with zero-image exams: ${noImages.length}`);
    console.log(`Patients with duplicate exams: ${duplicates.length}`);
    console.log(`Birth date mismatches: ${birthDateIssues.length}`);
    console.log(`Patients missing from DB: ${missingPatients.length}`);

  } finally {
    await prisma.$disconnect();
  }
}

diagnose().catch(console.error);
