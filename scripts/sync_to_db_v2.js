/**
 * Script de Sincronização para o Novo Modelo Patient/Exam
 * 
 * Este script lê o bytescale_mapping.json e sincroniza com o banco de dados
 * usando o novo modelo onde:
 * - Patient = pessoa física (identificada por nome + data de nascimento)
 * - Exam = cada visita/exame do paciente
 * 
 * Não faz nenhuma chamada ao Bytescale - apenas reorganiza dados locais e no banco.
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function sync() {
    console.log('🚀 Sincronização para Novo Modelo Patient/Exam\n');

    // 1. Carrega o arquivo de mapeamento
    const mappingPath = path.join(process.cwd(), 'scripts', 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
    if (!fs.existsSync(mappingPath)) {
        console.error('❌ bytescale_mapping.json não encontrado!');
        return;
    }

    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    const entries = Object.entries(mappingData);
    console.log(`📊 Encontradas ${entries.length} entradas no mapping.\n`);

    // 2. Agrupa por paciente (nome + data de nascimento)
    const patientGroups = {};

    for (const [folderKey, examData] of entries) {
        const name = examData.patient_name?.trim() || 'Desconhecido';
        const birthday = examData.birthday || null;

        // Cria chave única normalizando nome e data
        const normalizedName = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const birthKey = birthday ? new Date(birthday).toISOString().split('T')[0] : 'unknown';
        const uniqueKey = `${normalizedName}|${birthKey}`;

        if (!patientGroups[uniqueKey]) {
            patientGroups[uniqueKey] = {
                name: name,
                cpf: examData.cpf || null,
                birthDate: birthday ? new Date(birthday) : null,
                gender: examData.gender || null,
                underlyingDiseases: examData.underlying_diseases || null,
                ophthalmicDiseases: examData.ophthalmic_diseases || null,
                exams: []
            };
        }

        // Adiciona este exame ao paciente
        patientGroups[uniqueKey].exams.push({
            eyerCloudId: examData.exam_id || folderKey,
            examDate: examData.exam_date ? new Date(examData.exam_date) : new Date(),
            location: examData.clinic_name || 'Phelcom EyeR Cloud',
            technicianName: 'EyerCloud Sync',
            images: examData.images || []
        });
    }

    const uniquePatients = Object.values(patientGroups);
    console.log(`👥 Identificados ${uniquePatients.length} pacientes únicos.\n`);

    // 3. Exibe pacientes com múltiplos exames
    console.log('📋 Pacientes com múltiplas visitas:');
    let multiVisitCount = 0;
    for (const p of uniquePatients) {
        if (p.exams.length > 1) {
            multiVisitCount++;
            console.log(`   • ${p.name}: ${p.exams.length} exames`);
        }
    }
    if (multiVisitCount === 0) {
        console.log('   (nenhum paciente com múltiplas visitas)');
    }

    const totalExams = uniquePatients.reduce((sum, p) => sum + p.exams.length, 0);
    const totalImages = uniquePatients.reduce((sum, p) =>
        sum + p.exams.reduce((s, e) => s + e.images.length, 0), 0
    );
    console.log(`\n   Total: ${uniquePatients.length} pacientes, ${totalExams} exames, ${totalImages} imagens.\n`);

    // 4. Confirma antes de executar
    if (!process.argv.includes('--execute')) {
        console.log('⚠️  Execute com --execute para aplicar as mudanças no banco.\n');
        console.log('   node scripts/sync_to_db_v2.js --execute\n');
        await prisma.$disconnect();
        return;
    }

    // 5. Sincroniza com o banco
    console.log('🔄 Sincronizando com o banco de dados...\n');

    let successCount = 0;
    let errorCount = 0;
    let examCount = 0;
    let imageCount = 0;

    for (const patientData of uniquePatients) {
        try {
            // Tenta encontrar paciente existente
            let patient = await prisma.patient.findFirst({
                where: {
                    name: patientData.name,
                    ...(patientData.birthDate ? { birthDate: patientData.birthDate } : {})
                }
            });

            if (!patient) {
                // Cria novo paciente
                patient = await prisma.patient.create({
                    data: {
                        name: patientData.name,
                        cpf: patientData.cpf,
                        birthDate: patientData.birthDate,
                        gender: patientData.gender,
                        underlyingDiseases: patientData.underlyingDiseases,
                        ophthalmicDiseases: patientData.ophthalmicDiseases,
                    }
                });
            }

            // Cria/atualiza cada exame do paciente
            for (const examData of patientData.exams) {
                // Verifica se o exame já existe pelo eyerCloudId
                let exam = await prisma.exam.findFirst({
                    where: { eyerCloudId: examData.eyerCloudId }
                });

                if (!exam) {
                    exam = await prisma.exam.create({
                        data: {
                            eyerCloudId: examData.eyerCloudId,
                            examDate: examData.examDate,
                            location: examData.location,
                            technicianName: examData.technicianName,
                            status: 'pending',
                            patientId: patient.id
                        }
                    });
                    examCount++;
                }

                // Cria imagens do exame (se não existirem)
                for (let i = 0; i < examData.images.length; i++) {
                    const img = examData.images[i];
                    const imageId = `${exam.id}-${i}`;

                    try {
                        await prisma.examImage.upsert({
                            where: { id: imageId },
                            update: {
                                url: img.bytescale_url,
                                fileName: img.filename || `image-${i}.jpg`,
                                type: img.type || 'COLOR'
                            },
                            create: {
                                id: imageId,
                                url: img.bytescale_url,
                                fileName: img.filename || `image-${i}.jpg`,
                                type: img.type || 'COLOR',
                                examId: exam.id
                            }
                        });
                        imageCount++;
                    } catch (imgErr) {
                        // Ignora erros de imagem duplicada
                    }
                }
            }

            successCount++;
            if (successCount % 50 === 0) {
                console.log(`   Processados ${successCount}/${uniquePatients.length} pacientes...`);
            }
        } catch (err) {
            console.error(`❌ Erro ao sincronizar ${patientData.name}:`, err.message);
            errorCount++;
        }
    }

    console.log('\n✅ Sincronização concluída!');
    console.log(`   Pacientes: ${successCount} (${errorCount} erros)`);
    console.log(`   Exames criados: ${examCount}`);
    console.log(`   Imagens processadas: ${imageCount}`);

    await prisma.$disconnect();
}

sync().catch(console.error);
