/**
 * Database Backup / Snapshot
 * ==========================
 *
 * Exports ALL data from the PostgreSQL database (via Prisma) to a JSON file.
 * The resulting snapshot can be restored later using restore_snapshot.js.
 *
 * Output: backups/snapshot_YYYY-MM-DD_HHmmss.json
 *
 * Models exported:
 *   Patient, Exam, ExamImage, MedicalReport, PatientReferral, HealthUnit
 *
 * Usage:
 *   node scripts/backup_snapshot.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const SNAPSHOT_VERSION = '1.0.0';

function pad(n) {
    return String(n).padStart(2, '0');
}

function buildFileName() {
    const now = new Date();
    const date = [
        now.getFullYear(),
        pad(now.getMonth() + 1),
        pad(now.getDate())
    ].join('-');
    const time = [
        pad(now.getHours()),
        pad(now.getMinutes()),
        pad(now.getSeconds())
    ].join('');
    return `snapshot_${date}_${time}.json`;
}

async function main() {
    console.log('='.repeat(70));
    console.log('NEUROAPP - DATABASE BACKUP / SNAPSHOT');
    console.log('='.repeat(70));

    // Ensure backups directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log(`\n  Diretorio criado: ${BACKUP_DIR}`);
    }

    console.log('\n  Exportando dados do banco...\n');

    // Export all tables
    const [patients, exams, examImages, medicalReports, patientReferrals, healthUnits] =
        await Promise.all([
            prisma.patient.findMany(),
            prisma.exam.findMany(),
            prisma.examImage.findMany(),
            prisma.medicalReport.findMany(),
            prisma.patientReferral.findMany(),
            prisma.healthUnit.findMany(),
        ]);

    const counts = {
        patients: patients.length,
        exams: exams.length,
        examImages: examImages.length,
        medicalReports: medicalReports.length,
        patientReferrals: patientReferrals.length,
        healthUnits: healthUnits.length,
    };

    const snapshot = {
        metadata: {
            version: SNAPSHOT_VERSION,
            createdAt: new Date().toISOString(),
            counts,
        },
        data: {
            patients,
            exams,
            examImages,
            medicalReports,
            patientReferrals,
            healthUnits,
        },
    };

    const fileName = buildFileName();
    const filePath = path.join(BACKUP_DIR, fileName);

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

    const fileSizeMB = (fs.statSync(filePath).size / (1024 * 1024)).toFixed(2);

    console.log('  Contagens:');
    console.log(`    Patients:         ${counts.patients}`);
    console.log(`    Exams:            ${counts.exams}`);
    console.log(`    ExamImages:       ${counts.examImages}`);
    console.log(`    MedicalReports:   ${counts.medicalReports}`);
    console.log(`    PatientReferrals: ${counts.patientReferrals}`);
    console.log(`    HealthUnits:      ${counts.healthUnits}`);

    console.log('\n' + '='.repeat(70));
    console.log('  BACKUP CONCLUIDO!');
    console.log('='.repeat(70));
    console.log(`  Arquivo: ${filePath}`);
    console.log(`  Tamanho: ${fileSizeMB} MB`);
    console.log(`  Total de registros: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
    console.log('='.repeat(70) + '\n');

    console.log('  Para restaurar este backup:');
    console.log(`    node scripts/restore_snapshot.js ${path.relative(path.join(__dirname, '..'), filePath)}`);
    console.log(`    node scripts/restore_snapshot.js ${path.relative(path.join(__dirname, '..'), filePath)} --execute\n`);

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Erro fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
});
