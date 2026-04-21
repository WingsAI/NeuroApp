/**
 * Staging DB snapshot — mirrors scripts/db_snapshot.js but for the staging DB.
 * Saves to: scripts/db_snapshots/staging_snapshot_YYYY-MM-DD_HHMM.json
 */
const { PrismaClient } = require('.prisma/client-staging');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const SNAPSHOT_DIR = path.join(__dirname, 'db_snapshots');

function pad(n) { return String(n).padStart(2, '0'); }
function buildFileName() {
  const now = new Date();
  return `staging_snapshot_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}

async function main() {
  console.log('='.repeat(70));
  console.log('NEUROAPP - STAGING DB SNAPSHOT');
  console.log('='.repeat(70));

  if (!fs.existsSync(SNAPSHOT_DIR)) fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

  console.log('\n  Fetching staging data...\n');
  const [sourceLogins, patients, exams, images, logs] = await Promise.all([
    prisma.sourceLogin.findMany(),
    prisma.stagingPatient.findMany(),
    prisma.stagingExam.findMany(),
    prisma.stagingExamImage.findMany(),
    prisma.normalizationLog.findMany(),
  ]);

  const counts = {
    sourceLogins: sourceLogins.length,
    stagingPatients: patients.length,
    stagingExams: exams.length,
    stagingExamImages: images.length,
    normalizationLogs: logs.length,
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const snapshot = {
    summary: { createdAt: new Date().toISOString(), totalRecords: total, counts },
    data: { sourceLogins, stagingPatients: patients, stagingExams: exams, stagingExamImages: images, normalizationLogs: logs },
  };

  const fileName = buildFileName();
  const filePath = path.join(SNAPSHOT_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  const sizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);

  console.log('  Counts:');
  Object.entries(counts).forEach(([k, v]) => console.log(`    ${k.padEnd(20)} ${v}`));
  console.log(`    Total:               ${total}`);
  console.log(`\n  File: ${filePath}`);
  console.log(`  Size: ${sizeMB} MB\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Fatal error:', e);
  await prisma.$disconnect();
  process.exit(1);
});
