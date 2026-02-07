/**
 * Database Snapshot
 * =================
 *
 * Exports data from the PostgreSQL database (via Prisma) to a JSON file.
 * Saves to: scripts/db_snapshots/snapshot_YYYY-MM-DD_HHMM.json
 *
 * Tables exported:
 *   Patient, Exam, ExamImage (partial), MedicalReport, PatientReferral
 *
 * For ExamImage, only id, examId, url, type, and uploadedAt are saved.
 *
 * Usage:
 *   node scripts/db_snapshot.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const SNAPSHOT_DIR = path.join(__dirname, 'db_snapshots');

function pad(n) {
  return String(n).padStart(2, '0');
}

function buildFileName() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
  ].join('-');
  const time = pad(now.getHours()) + pad(now.getMinutes());
  return 'snapshot_' + date + '_' + time + '.json';
}

async function main() {
  console.log('='.repeat(70));
  console.log('NEUROAPP - DATABASE SNAPSHOT');
  console.log('='.repeat(70));

  // Ensure snapshot directory exists
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
    console.log('\n  Directory created: ' + SNAPSHOT_DIR);
  }

  console.log('\n  Fetching data from database...\n');

  // Export all tables in parallel
  const [patients, exams, examImages, medicalReports, patientReferrals] =
    await Promise.all([
      prisma.patient.findMany(),
      prisma.exam.findMany(),
      prisma.examImage.findMany({
        select: {
          id: true,
          examId: true,
          url: true,
          type: true,
          uploadedAt: true,
        },
      }),
      prisma.medicalReport.findMany(),
      prisma.patientReferral.findMany(),
    ]);

  const counts = {
    patients: patients.length,
    exams: exams.length,
    examImages: examImages.length,
    medicalReports: medicalReports.length,
    patientReferrals: patientReferrals.length,
  };

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  const snapshot = {
    summary: {
      createdAt: new Date().toISOString(),
      totalRecords,
      counts,
    },
    data: {
      patients,
      exams,
      examImages,
      medicalReports,
      patientReferrals,
    },
  };

  const fileName = buildFileName();
  const filePath = path.join(SNAPSHOT_DIR, fileName);

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

  const fileSizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);

  console.log('  Counts:');
  console.log('    Patients:         ' + counts.patients);
  console.log('    Exams:            ' + counts.exams);
  console.log('    ExamImages:       ' + counts.examImages);
  console.log('    MedicalReports:   ' + counts.medicalReports);
  console.log('    PatientReferrals: ' + counts.patientReferrals);
  console.log('    ---------------------------------');
  console.log('    Total records:    ' + totalRecords);

  console.log('\n' + '='.repeat(70));
  console.log('  SNAPSHOT COMPLETE');
  console.log('='.repeat(70));
  console.log('  File: ' + filePath);
  console.log('  Size: ' + fileSizeMB + ' MB');
  console.log('='.repeat(70) + '\n');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
