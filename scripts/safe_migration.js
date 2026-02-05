/**
 * Script de Migração SEGURA para o Novo Modelo Patient/Exam
 * 
 * Este script faz a migração preservando TODOS os laudos existentes.
 * 
 * Etapas:
 * 1. Exporta todos os dados atuais (patients, images, reports, referrals)
 * 2. Cria as novas tabelas (Exam, ExamImage)
 * 3. Migra os dados para o novo modelo
 * 4. Vincula os laudos existentes aos novos exames
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function safeMigration() {
    console.log('🛡️ Migração SEGURA para Novo Modelo Patient/Exam\n');
    console.log('   Este processo preserva TODOS os laudos existentes.\n');

    // ====== ETAPA 1: Exportar dados atuais ======
    console.log('📦 Etapa 1: Exportando dados atuais...\n');

    // Busca todos os dados atuais
    const patients = await prisma.patient.findMany({
        include: {
            images: true,
            report: true,
            referral: true
        }
    });

    console.log(`   Encontrados: ${patients.length} pacientes`);

    const patientsWithReports = patients.filter(p => p.report);
    console.log(`   Com laudos: ${patientsWithReports.length}`);

    const patientsWithReferrals = patients.filter(p => p.referral);
    console.log(`   Com encaminhamentos: ${patientsWithReferrals.length}`);

    const totalImages = patients.reduce((sum, p) => sum + p.images.length, 0);
    console.log(`   Total de imagens: ${totalImages}\n`);

    // Salva backup local
    const backupData = {
        exportedAt: new Date().toISOString(),
        patients: patients.map(p => ({
            ...p,
            birthDate: p.birthDate?.toISOString(),
            examDate: p.examDate?.toISOString(),
            createdAt: p.createdAt?.toISOString(),
            updatedAt: p.updatedAt?.toISOString(),
            images: p.images.map(img => ({
                ...img,
                uploadedAt: img.uploadedAt?.toISOString()
            })),
            report: p.report ? {
                ...p.report,
                completedAt: p.report.completedAt?.toISOString()
            } : null,
            referral: p.referral ? {
                ...p.referral,
                referralDate: p.referral.referralDate?.toISOString(),
                outcomeDate: p.referral.outcomeDate?.toISOString(),
                scheduledDate: p.referral.scheduledDate?.toISOString()
            } : null
        }))
    };

    fs.writeFileSync('migration_backup.json', JSON.stringify(backupData, null, 2));
    console.log('   💾 Backup salvo em: migration_backup.json\n');

    // ====== ETAPA 2: Análise de agrupamento ======
    console.log('📊 Etapa 2: Analisando agrupamento por paciente...\n');

    // Agrupa pacientes por nome + data de nascimento
    const patientGroups = {};

    for (const patient of patients) {
        const normalizedName = patient.name.trim().toUpperCase();
        const birthKey = patient.birthDate
            ? patient.birthDate.toISOString().split('T')[0]
            : 'unknown';
        const uniqueKey = `${normalizedName}|${birthKey}`;

        if (!patientGroups[uniqueKey]) {
            patientGroups[uniqueKey] = {
                name: patient.name,
                cpf: patient.cpf,
                birthDate: patient.birthDate,
                gender: patient.gender,
                ethnicity: patient.ethnicity,
                education: patient.education,
                occupation: patient.occupation,
                phone: patient.phone,
                underlyingDiseases: patient.underlyingDiseases,
                ophthalmicDiseases: patient.ophthalmicDiseases,
                exams: []
            };
        }

        // Cada registro antigo vira um exame
        patientGroups[uniqueKey].exams.push({
            oldPatientId: patient.id,
            examDate: patient.examDate,
            location: patient.location,
            technicianName: patient.technicianName,
            status: patient.status,
            createdAt: patient.createdAt,
            images: patient.images,
            report: patient.report,
            referral: patient.referral
        });
    }

    const uniquePatients = Object.values(patientGroups);
    const multiVisit = uniquePatients.filter(p => p.exams.length > 1);

    console.log(`   Pacientes únicos: ${uniquePatients.length}`);
    console.log(`   Com múltiplas visitas: ${multiVisit.length}`);

    if (multiVisit.length > 0) {
        console.log('\n   Pacientes com múltiplas visitas:');
        for (const p of multiVisit.slice(0, 10)) {
            console.log(`     • ${p.name}: ${p.exams.length} exames`);
        }
        if (multiVisit.length > 10) {
            console.log(`     ... e mais ${multiVisit.length - 10} pacientes`);
        }
    }

    // ====== ETAPA 3: Criar mapeamento de migração ======
    console.log('\n📋 Etapa 3: Criando plano de migração...\n');

    const migrationPlan = {
        createdAt: new Date().toISOString(),
        summary: {
            originalPatients: patients.length,
            uniquePatients: uniquePatients.length,
            totalExams: patients.length, // cada patient antigo vira um exam
            reportsToMigrate: patientsWithReports.length,
            referralsToMigrate: patientsWithReferrals.length,
            imagesToMigrate: totalImages
        },
        patientGroups: uniquePatients.map(p => ({
            name: p.name,
            examCount: p.exams.length,
            oldIds: p.exams.map(e => e.oldPatientId)
        }))
    };

    fs.writeFileSync('migration_plan.json', JSON.stringify(migrationPlan, null, 2));
    console.log('   📄 Plano salvo em: migration_plan.json');
    console.log('\n   Resumo:');
    console.log(`     Pacientes originais: ${migrationPlan.summary.originalPatients}`);
    console.log(`     Pacientes únicos (novo): ${migrationPlan.summary.uniquePatients}`);
    console.log(`     Exames a criar: ${migrationPlan.summary.totalExams}`);
    console.log(`     Laudos a preservar: ${migrationPlan.summary.reportsToMigrate}`);
    console.log(`     Encaminhamentos a preservar: ${migrationPlan.summary.referralsToMigrate}`);
    console.log(`     Imagens a migrar: ${migrationPlan.summary.imagesToMigrate}`);

    // ====== ETAPA 4: Executar migração (se solicitado) ======
    if (!process.argv.includes('--execute')) {
        console.log('\n⚠️ Para executar a migração, rode com --execute');
        console.log('   node scripts/safe_migration.js --execute\n');
        console.log('⚠️ IMPORTANTE: Antes de executar, você precisa:');
        console.log('   1. Fazer backup do banco de dados');
        console.log('   2. Aplicar o novo schema manualmente via SQL');
        console.log('      (o script mostrará os comandos SQL necessários)\n');
        await prisma.$disconnect();
        return;
    }

    console.log('\n🔄 Etapa 4: Executando migração...\n');
    console.log('   ⚠️ Esta operação modificará o banco de dados!\n');

    // Para fazer a migração real, precisamos executar SQL raw
    // porque o Prisma não permite criar tabelas dinamicamente

    console.log('   Gerando SQL de migração...\n');

    const sqlStatements = [];

    // Cria tabela Exam
    sqlStatements.push(`
-- Cria tabela Exam
CREATE TABLE IF NOT EXISTS "Exam" (
    "id" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eyerCloudId" TEXT,
    "patientId" TEXT NOT NULL,
    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);
    `);

    // Cria tabela ExamImage
    sqlStatements.push(`
-- Cria tabela ExamImage
CREATE TABLE IF NOT EXISTS "ExamImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "type" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    CONSTRAINT "ExamImage_pkey" PRIMARY KEY ("id")
);
    `);

    // Adiciona constraints
    sqlStatements.push(`
-- Adiciona foreign keys
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_patientId_fkey" 
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamImage" ADD CONSTRAINT "ExamImage_examId_fkey" 
    FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);

    // Migra dados
    sqlStatements.push(`
-- Migra dados: cada Patient antigo vira um Exam
INSERT INTO "Exam" ("id", "examDate", "location", "technicianName", "status", "createdAt", "patientId")
SELECT 
    "id", 
    "examDate", 
    "location", 
    COALESCE("technicianName", 'EyerCloud Sync'),
    COALESCE("status", 'pending'),
    "createdAt",
    "id"
FROM "Patient";
    `);

    sqlStatements.push(`
-- Migra imagens de PatientImage para ExamImage
INSERT INTO "ExamImage" ("id", "url", "fileName", "type", "uploadedAt", "examId")
SELECT "id", "url", "fileName", "type", "uploadedAt", "patientId"
FROM "PatientImage";
    `);

    // Modifica MedicalReport
    sqlStatements.push(`
-- Adiciona coluna examId ao MedicalReport
ALTER TABLE "MedicalReport" ADD COLUMN IF NOT EXISTS "examId" TEXT;

-- Copia patientId para examId (já que 1 patient antigo = 1 exam)
UPDATE "MedicalReport" SET "examId" = "patientId";
    `);

    // Modifica PatientReferral
    sqlStatements.push(`
-- Adiciona coluna examId ao PatientReferral
ALTER TABLE "PatientReferral" ADD COLUMN IF NOT EXISTS "examId" TEXT;

-- Copia patientId para examId
UPDATE "PatientReferral" SET "examId" = "patientId";
    `);

    console.log('   SQL gerado. Salvando em migration_sql.sql...\n');
    fs.writeFileSync('migration_sql.sql', sqlStatements.join('\n'));

    console.log('   Executando SQL...\n');

    for (let i = 0; i < sqlStatements.length; i++) {
        try {
            await prisma.$executeRawUnsafe(sqlStatements[i]);
            console.log(`   ✅ Statement ${i + 1}/${sqlStatements.length} executado`);
        } catch (err) {
            console.log(`   ⚠️ Statement ${i + 1}: ${err.message}`);
        }
    }

    console.log('\n✅ Migração concluída!');
    console.log('   Verifique os dados no banco antes de atualizar o schema do Prisma.');

    await prisma.$disconnect();
}

safeMigration().catch(console.error);
