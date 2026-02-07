/**
 * Database Restore from Snapshot
 * ==============================
 *
 * Restores ALL data from a backup JSON file created by backup_snapshot.js.
 * Clears existing data first (in FK-safe order), then inserts everything
 * inside a transaction.
 *
 * Usage:
 *   node scripts/restore_snapshot.js backups/snapshot_2026-02-07_143000.json            # Preview (default)
 *   node scripts/restore_snapshot.js backups/snapshot_2026-02-07_143000.json --execute  # Execute restore
 *
 * Flags:
 *   --preview   Show what would happen without modifying the database (default)
 *   --execute   Actually perform the restore
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Deletion order: children first, parents last (respects FK constraints)
const DELETE_ORDER = [
    'examImage',
    'medicalReport',
    'patientReferral',
    'exam',
    'patient',
    'healthUnit',
];

// Insertion order: parents first, children last (respects FK constraints)
const INSERT_ORDER = [
    { model: 'healthUnit', key: 'healthUnits' },
    { model: 'patient', key: 'patients' },
    { model: 'exam', key: 'exams' },
    { model: 'examImage', key: 'examImages' },
    { model: 'medicalReport', key: 'medicalReports' },
    { model: 'patientReferral', key: 'patientReferrals' },
];

// Fields that are Date objects and need to be converted from ISO strings
const DATE_FIELDS = {
    patient: ['birthDate', 'createdAt', 'updatedAt'],
    exam: ['examDate', 'createdAt', 'updatedAt'],
    examImage: ['uploadedAt'],
    medicalReport: ['completedAt'],
    patientReferral: ['referralDate', 'outcomeDate', 'scheduledDate'],
    healthUnit: ['createdAt', 'updatedAt'],
};

function parseDates(record, modelName) {
    const fields = DATE_FIELDS[modelName] || [];
    const parsed = { ...record };
    for (const field of fields) {
        if (parsed[field] !== null && parsed[field] !== undefined) {
            parsed[field] = new Date(parsed[field]);
        }
    }
    return parsed;
}

/**
 * Strip Prisma relation fields that are not actual columns.
 * The backup may contain nested relation objects if the schema changes.
 * We only keep scalar fields.
 */
function stripRelations(record, modelName) {
    const relationFields = {
        patient: ['exams'],
        exam: ['patient', 'images', 'report', 'referral'],
        examImage: ['Exam'],
        medicalReport: ['exam'],
        patientReferral: ['Exam'],
        healthUnit: [],
    };
    const toRemove = relationFields[modelName] || [];
    const cleaned = { ...record };
    for (const rel of toRemove) {
        delete cleaned[rel];
    }
    return cleaned;
}

async function main() {
    const args = process.argv.slice(2);
    const execute = args.includes('--execute');
    const filePath = args.find(a => !a.startsWith('--'));

    if (!filePath) {
        console.log('Uso:');
        console.log('  node scripts/restore_snapshot.js <caminho-do-backup.json>');
        console.log('  node scripts/restore_snapshot.js <caminho-do-backup.json> --execute');
        console.log('\nExemplo:');
        console.log('  node scripts/restore_snapshot.js backups/snapshot_2026-02-07_143000.json');
        console.log('  node scripts/restore_snapshot.js backups/snapshot_2026-02-07_143000.json --execute');
        process.exit(1);
    }

    // Resolve path relative to project root
    const resolvedPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(path.join(__dirname, '..'), filePath);

    console.log('='.repeat(70));
    console.log('NEUROAPP - DATABASE RESTORE FROM SNAPSHOT');
    console.log('='.repeat(70));

    if (!execute) {
        console.log('\n  MODO PREVIEW - use --execute para aplicar a restauracao\n');
    } else {
        console.log('\n  MODO EXECUTE - os dados serao restaurados!\n');
    }

    // Validate file
    if (!fs.existsSync(resolvedPath)) {
        console.error(`  ERRO: Arquivo nao encontrado: ${resolvedPath}`);
        process.exit(1);
    }

    console.log(`  Arquivo: ${resolvedPath}`);

    const raw = fs.readFileSync(resolvedPath, 'utf8');
    let snapshot;
    try {
        snapshot = JSON.parse(raw);
    } catch (err) {
        console.error(`  ERRO: JSON invalido: ${err.message}`);
        process.exit(1);
    }

    // Validate structure
    if (!snapshot.metadata || !snapshot.data) {
        console.error('  ERRO: Formato de snapshot invalido (faltando metadata ou data)');
        process.exit(1);
    }

    const { metadata, data } = snapshot;

    console.log(`  Versao do snapshot: ${metadata.version}`);
    console.log(`  Criado em: ${metadata.createdAt}`);
    console.log('');
    console.log('  Conteudo do backup:');
    console.log(`    Patients:         ${(data.patients || []).length}`);
    console.log(`    Exams:            ${(data.exams || []).length}`);
    console.log(`    ExamImages:       ${(data.examImages || []).length}`);
    console.log(`    MedicalReports:   ${(data.medicalReports || []).length}`);
    console.log(`    PatientReferrals: ${(data.patientReferrals || []).length}`);
    console.log(`    HealthUnits:      ${(data.healthUnits || []).length}`);

    const totalRecords = INSERT_ORDER.reduce((sum, { key }) => sum + (data[key] || []).length, 0);
    console.log(`    --------------------------------`);
    console.log(`    Total:            ${totalRecords}`);

    // Fetch current DB counts for comparison
    console.log('\n  Estado atual do banco:');
    const currentCounts = {};
    for (const { model, key } of INSERT_ORDER) {
        const count = await prisma[model].count();
        currentCounts[key] = count;
    }
    console.log(`    Patients:         ${currentCounts.patients}`);
    console.log(`    Exams:            ${currentCounts.exams}`);
    console.log(`    ExamImages:       ${currentCounts.examImages}`);
    console.log(`    MedicalReports:   ${currentCounts.medicalReports}`);
    console.log(`    PatientReferrals: ${currentCounts.patientReferrals}`);
    console.log(`    HealthUnits:      ${currentCounts.healthUnits}`);

    if (!execute) {
        console.log('\n' + '='.repeat(70));
        console.log('  PREVIEW CONCLUIDO');
        console.log('='.repeat(70));
        console.log('  Nenhuma alteracao foi feita no banco.');
        console.log('  Para executar a restauracao, adicione --execute');
        console.log(`\n  node scripts/restore_snapshot.js ${filePath} --execute\n`);
        await prisma.$disconnect();
        return;
    }

    // Confirm execution
    console.log('\n  Iniciando restauracao...');
    console.log('  ATENCAO: Todos os dados atuais serao APAGADOS e substituidos!\n');

    // Use a transaction for the entire operation
    try {
        await prisma.$transaction(async (tx) => {
            // Step 1: Delete all existing data in FK-safe order
            console.log('  [1/2] Limpando banco de dados...');
            for (const modelName of DELETE_ORDER) {
                const result = await tx[modelName].deleteMany({});
                console.log(`    Removidos: ${modelName} -> ${result.count} registros`);
            }

            // Step 2: Insert all data in FK-safe order
            console.log('\n  [2/2] Inserindo dados do backup...');
            for (const { model, key } of INSERT_ORDER) {
                const records = data[key] || [];
                if (records.length === 0) {
                    console.log(`    Inseridos: ${model} -> 0 registros (vazio)`);
                    continue;
                }

                // Process in batches to avoid memory issues with very large datasets
                const BATCH_SIZE = 500;
                let inserted = 0;

                for (let i = 0; i < records.length; i += BATCH_SIZE) {
                    const batch = records.slice(i, i + BATCH_SIZE);
                    const cleaned = batch.map(record => {
                        const stripped = stripRelations(record, model);
                        return parseDates(stripped, model);
                    });

                    await tx[model].createMany({
                        data: cleaned,
                        skipDuplicates: true,
                    });

                    inserted += batch.length;
                }

                console.log(`    Inseridos: ${model} -> ${inserted} registros`);
            }
        }, {
            maxWait: 60000,   // 60s max wait for transaction slot
            timeout: 300000,  // 5 min timeout for the full transaction
        });

        console.log('\n' + '='.repeat(70));
        console.log('  RESTAURACAO CONCLUIDA COM SUCESSO!');
        console.log('='.repeat(70));

        // Verify final counts
        console.log('\n  Verificacao final:');
        for (const { model, key } of INSERT_ORDER) {
            const count = await prisma[model].count();
            const expected = (data[key] || []).length;
            const status = count === expected ? 'OK' : `DIVERGENCIA (esperado: ${expected})`;
            console.log(`    ${model}: ${count} registros - ${status}`);
        }
        console.log('='.repeat(70) + '\n');

    } catch (err) {
        console.error('\n  ERRO DURANTE A RESTAURACAO!');
        console.error(`  ${err.message}`);
        console.error('  A transacao foi revertida. Nenhum dado foi alterado.\n');
        await prisma.$disconnect();
        process.exit(1);
    }

    await prisma.$disconnect();
}

main().catch(async (err) => {
    console.error('Erro fatal:', err);
    await prisma.$disconnect();
    process.exit(1);
});
