/**
 * Script de Migração para o Novo Modelo Patient/Exam
 * 
 * Este script migra os dados do modelo antigo (onde cada exame era um "paciente")
 * para o novo modelo onde Patient representa a pessoa física e Exam representa cada visita.
 * 
 * IMPORTANTE: Execute este script APÓS aplicar o novo schema com `npx prisma db push`
 */

const { PrismaClient } = require('@prisma/client');

// Usamos dois clientes: um para o schema antigo (leitura) e outro para o novo (escrita)
const prisma = new PrismaClient();

async function migrate() {
    console.log('🚀 Iniciando migração para modelo Patient/Exam...\n');

    // 1. Busca todos os registros antigos (que eram "pacientes" mas na verdade são exames)
    const oldPatients = await prisma.$queryRaw`
        SELECT * FROM "Patient" ORDER BY name, "birthDate", "examDate"
    `;

    console.log(`📊 Encontrados ${oldPatients.length} registros antigos para migrar.\n`);

    // 2. Agrupa por nome + data de nascimento para identificar pacientes únicos
    const patientGroups = {};

    for (const old of oldPatients) {
        // Cria uma chave única baseada no nome normalizado + data de nascimento
        const normalizedName = old.name.trim().toUpperCase();
        const birthKey = old.birthDate ? old.birthDate.toISOString().split('T')[0] : 'unknown';
        const uniqueKey = `${normalizedName}|${birthKey}`;

        if (!patientGroups[uniqueKey]) {
            patientGroups[uniqueKey] = {
                name: old.name,
                cpf: old.cpf,
                birthDate: old.birthDate,
                gender: old.gender,
                ethnicity: old.ethnicity,
                education: old.education,
                occupation: old.occupation,
                phone: old.phone,
                underlyingDiseases: old.underlyingDiseases,
                ophthalmicDiseases: old.ophthalmicDiseases,
                exams: []
            };
        }

        // Adiciona este exame ao paciente
        patientGroups[uniqueKey].exams.push({
            oldId: old.id,
            examDate: old.examDate,
            location: old.location,
            technicianName: old.technicianName,
            status: old.status,
            createdAt: old.createdAt
        });
    }

    const uniquePatients = Object.values(patientGroups);
    console.log(`👥 Identificados ${uniquePatients.length} pacientes únicos.\n`);

    // 3. Exibe resumo antes de migrar
    console.log('📋 Resumo da migração:');
    let totalExams = 0;
    for (const p of uniquePatients) {
        totalExams += p.exams.length;
        if (p.exams.length > 1) {
            console.log(`   • ${p.name}: ${p.exams.length} exames`);
        }
    }
    console.log(`\n   Total: ${uniquePatients.length} pacientes com ${totalExams} exames.\n`);

    // 4. Cria as novas tabelas (se não existirem)
    console.log('⏳ A migração real requer que você execute as seguintes etapas:\n');
    console.log('   1. Renomeie schema.prisma para schema_old.prisma');
    console.log('   2. Renomeie schema_v2.prisma para schema.prisma');
    console.log('   3. Execute: npx prisma db push');
    console.log('   4. Execute este script novamente com --execute\n');

    // Se o flag --execute foi passado, realiza a migração
    if (process.argv.includes('--execute')) {
        console.log('🔄 Executando migração real...\n');

        // Cria mapeamento de IDs antigos para novos
        const idMapping = {};

        let successCount = 0;
        let errorCount = 0;

        for (const patientData of uniquePatients) {
            try {
                // Cria o novo paciente
                const newPatient = await prisma.patient.create({
                    data: {
                        name: patientData.name,
                        cpf: patientData.cpf || null,
                        birthDate: patientData.birthDate,
                        gender: patientData.gender,
                        ethnicity: patientData.ethnicity,
                        education: patientData.education,
                        occupation: patientData.occupation,
                        phone: patientData.phone,
                        underlyingDiseases: patientData.underlyingDiseases,
                        ophthalmicDiseases: patientData.ophthalmicDiseases,
                    }
                });

                // Cria cada exame do paciente
                for (const examData of patientData.exams) {
                    const newExam = await prisma.exam.create({
                        data: {
                            eyerCloudId: examData.oldId,
                            examDate: examData.examDate,
                            location: examData.location,
                            technicianName: examData.technicianName,
                            status: examData.status,
                            createdAt: examData.createdAt,
                            patientId: newPatient.id
                        }
                    });

                    idMapping[examData.oldId] = {
                        newPatientId: newPatient.id,
                        newExamId: newExam.id
                    };

                    // Migra imagens
                    const oldImages = await prisma.$queryRaw`
                        SELECT * FROM "PatientImage" WHERE "patientId" = ${examData.oldId}
                    `;

                    for (const img of oldImages) {
                        await prisma.examImage.create({
                            data: {
                                url: img.url,
                                fileName: img.fileName,
                                type: img.type,
                                uploadedAt: img.uploadedAt,
                                examId: newExam.id
                            }
                        });
                    }

                    // Migra laudo (se existir)
                    const oldReport = await prisma.$queryRaw`
                        SELECT * FROM "MedicalReport" WHERE "patientId" = ${examData.oldId}
                    `;

                    if (oldReport.length > 0) {
                        const r = oldReport[0];
                        await prisma.medicalReport.create({
                            data: {
                                doctorName: r.doctorName,
                                doctorCRM: r.doctorCRM,
                                findings: r.findings,
                                diagnosis: r.diagnosis,
                                recommendations: r.recommendations,
                                suggestedConduct: r.suggestedConduct,
                                diagnosticConditions: r.diagnosticConditions,
                                selectedImages: r.selectedImages,
                                completedAt: r.completedAt,
                                syncedToDrive: r.syncedToDrive,
                                driveFileId: r.driveFileId,
                                examId: newExam.id
                            }
                        });
                    }

                    // Migra encaminhamento (se existir)
                    const oldReferral = await prisma.$queryRaw`
                        SELECT * FROM "PatientReferral" WHERE "patientId" = ${examData.oldId}
                    `;

                    if (oldReferral.length > 0) {
                        const ref = oldReferral[0];
                        await prisma.patientReferral.create({
                            data: {
                                referredBy: ref.referredBy,
                                referralDate: ref.referralDate,
                                specialty: ref.specialty,
                                urgency: ref.urgency,
                                notes: ref.notes,
                                specializedService: ref.specializedService,
                                outcome: ref.outcome,
                                outcomeDate: ref.outcomeDate,
                                scheduledDate: ref.scheduledDate,
                                status: ref.status,
                                examId: newExam.id
                            }
                        });
                    }
                }

                successCount++;
                if (successCount % 50 === 0) {
                    console.log(`   Processados ${successCount}/${uniquePatients.length} pacientes...`);
                }
            } catch (err) {
                console.error(`❌ Erro ao migrar ${patientData.name}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n✅ Migração concluída!');
        console.log(`   Sucesso: ${successCount}`);
        console.log(`   Erros: ${errorCount}`);

        // Salva mapeamento para referência
        const fs = require('fs');
        fs.writeFileSync('migration_id_mapping.json', JSON.stringify(idMapping, null, 2));
        console.log('\n📄 Mapeamento de IDs salvo em migration_id_mapping.json');
    }

    await prisma.$disconnect();
}

migrate().catch(console.error);
