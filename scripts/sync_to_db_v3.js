/**
 * Script de Sincronização v3 - Com Correção de Dados
 * 
 * Este script lê o bytescale_mapping_cleaned.json e sincroniza com o banco de dados,
 * ATUALIZANDO pacientes e exames existentes com os dados corretos.
 * 
 * Mudanças em relação ao v2:
 * - Atualiza pacientes existentes com dados faltantes (CPF, birthDate, gender, etc.)
 * - Atualiza exames existentes com dados corretos
 * - Reconecta imagens que estavam desconectadas dos exames
 * 
 * Uso:
 *   node scripts/sync_to_db_v3.js              # Mostra preview
 *   node scripts/sync_to_db_v3.js --execute    # Aplica mudanças
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

function parseDate(dateStr) {
    if (!dateStr) return null;

    // Handle ISO format
    if (dateStr.includes('T')) {
        return new Date(dateStr);
    }

    // Handle DD/MM/YYYY format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts;
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }

    // Handle YYYY-MM-DD format
    if (dateStr.includes('-')) {
        return new Date(dateStr);
    }

    return null;
}

async function sync() {
    console.log('🚀 Sincronização v3 - Com Correção de Dados\n');

    // 1. Carrega o arquivo de mapeamento
    const mappingPath = path.join(process.cwd(), 'scripts', 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
    if (!fs.existsSync(mappingPath)) {
        console.error('❌ bytescale_mapping_cleaned.json não encontrado!');
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
                birthDate: parseDate(birthday),
                gender: examData.gender || null,
                underlyingDiseases: examData.underlying_diseases || null,
                ophthalmicDiseases: examData.ophthalmic_diseases || null,
                exams: []
            };
        } else {
            // Atualiza dados se vieram vazios antes
            if (!patientGroups[uniqueKey].cpf && examData.cpf) {
                patientGroups[uniqueKey].cpf = examData.cpf;
            }
            if (!patientGroups[uniqueKey].gender && examData.gender) {
                patientGroups[uniqueKey].gender = examData.gender;
            }
            if (!patientGroups[uniqueKey].underlyingDiseases && examData.underlying_diseases) {
                patientGroups[uniqueKey].underlyingDiseases = examData.underlying_diseases;
            }
        }

        // Adiciona este exame ao paciente
        patientGroups[uniqueKey].exams.push({
            eyerCloudId: examData.exam_id || folderKey,
            examDate: parseDate(examData.exam_date) || new Date(),
            location: examData.clinic_name || 'Phelcom EyeR Cloud',
            technicianName: 'EyerCloud Sync',
            images: examData.images || []
        });
    }

    const uniquePatients = Object.values(patientGroups);
    console.log(`👥 Identificados ${uniquePatients.length} pacientes únicos.\n`);

    // 3. Exibe estatísticas
    const patientsWithCPF = uniquePatients.filter(p => p.cpf).length;
    const patientsWithBirthDate = uniquePatients.filter(p => p.birthDate).length;
    const patientsWithGender = uniquePatients.filter(p => p.gender).length;
    const patientsWithDiseases = uniquePatients.filter(p =>
        p.underlyingDiseases && Object.values(p.underlyingDiseases).some(v => v)
    ).length;

    console.log('📋 Dados disponíveis no mapping:');
    console.log(`   • Com CPF: ${patientsWithCPF}/${uniquePatients.length}`);
    console.log(`   • Com Data de Nascimento: ${patientsWithBirthDate}/${uniquePatients.length}`);
    console.log(`   • Com Sexo: ${patientsWithGender}/${uniquePatients.length}`);
    console.log(`   • Com Doenças: ${patientsWithDiseases}/${uniquePatients.length}`);

    const totalExams = uniquePatients.reduce((sum, p) => sum + p.exams.length, 0);
    const totalImages = uniquePatients.reduce((sum, p) =>
        sum + p.exams.reduce((s, e) => s + e.images.length, 0), 0
    );
    console.log(`\n   Total: ${uniquePatients.length} pacientes, ${totalExams} exames, ${totalImages} imagens.\n`);

    // 4. Confirma antes de executar
    if (!process.argv.includes('--execute')) {
        console.log('⚠️  Execute com --execute para aplicar as mudanças no banco.\n');
        console.log('   node scripts/sync_to_db_v3.js --execute\n');
        await prisma.$disconnect();
        return;
    }

    // 5. Sincroniza com o banco (com UPDATE)
    console.log('🔄 Sincronizando com o banco de dados...\n');

    let createdPatients = 0;
    let updatedPatients = 0;
    let createdExams = 0;
    let updatedExams = 0;
    let createdImages = 0;
    let errorCount = 0;

    for (const patientData of uniquePatients) {
        try {
            // Tenta encontrar paciente existente (por nome, ignoring case)
            let patient = await prisma.patient.findFirst({
                where: {
                    name: {
                        equals: patientData.name,
                        mode: 'insensitive'
                    }
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
                createdPatients++;
                console.log(`   ✅ Criado: ${patientData.name}`);
            } else {
                // ATUALIZA paciente existente se tiver dados novos
                const updateData = {};

                if (!patient.cpf && patientData.cpf) {
                    updateData.cpf = patientData.cpf;
                }
                if (!patient.birthDate && patientData.birthDate) {
                    updateData.birthDate = patientData.birthDate;
                }
                if (!patient.gender && patientData.gender) {
                    updateData.gender = patientData.gender;
                }
                if (!patient.underlyingDiseases && patientData.underlyingDiseases) {
                    updateData.underlyingDiseases = patientData.underlyingDiseases;
                }
                if (!patient.ophthalmicDiseases && patientData.ophthalmicDiseases) {
                    updateData.ophthalmicDiseases = patientData.ophthalmicDiseases;
                }

                if (Object.keys(updateData).length > 0) {
                    patient = await prisma.patient.update({
                        where: { id: patient.id },
                        data: updateData
                    });
                    updatedPatients++;
                    console.log(`   🔄 Atualizado: ${patientData.name} (${Object.keys(updateData).join(', ')})`);
                }
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
                    createdExams++;
                } else {
                    // Atualiza exame existente se necessário
                    const examUpdateData = {};

                    if (exam.patientId !== patient.id) {
                        examUpdateData.patientId = patient.id;
                    }
                    if (exam.location !== examData.location && examData.location !== 'Phelcom EyeR Cloud') {
                        examUpdateData.location = examData.location;
                    }
                    if (!exam.examDate || exam.examDate.getTime() !== examData.examDate.getTime()) {
                        examUpdateData.examDate = examData.examDate;
                    }

                    if (Object.keys(examUpdateData).length > 0) {
                        exam = await prisma.exam.update({
                            where: { id: exam.id },
                            data: examUpdateData
                        });
                        updatedExams++;
                    }
                }

                // Cria imagens do exame (se não existirem)
                for (let i = 0; i < examData.images.length; i++) {
                    const img = examData.images[i];
                    if (!img.bytescale_url) continue;

                    // Verifica se imagem já existe por URL
                    const existingImage = await prisma.examImage.findFirst({
                        where: { url: img.bytescale_url }
                    });

                    if (!existingImage) {
                        try {
                            await prisma.examImage.create({
                                data: {
                                    url: img.bytescale_url,
                                    fileName: img.filename || `image-${i}.jpg`,
                                    type: img.type || 'COLOR',
                                    examId: exam.id
                                }
                            });
                            createdImages++;
                        } catch (imgErr) {
                            // Ignora erros de imagem duplicada
                        }
                    } else if (existingImage.examId !== exam.id) {
                        // Reconecta imagem ao exame correto
                        await prisma.examImage.update({
                            where: { id: existingImage.id },
                            data: { examId: exam.id }
                        });
                    }
                }
            }

            if ((createdPatients + updatedPatients) % 50 === 0) {
                console.log(`   Processados ${createdPatients + updatedPatients}/${uniquePatients.length} pacientes...`);
            }
        } catch (err) {
            console.error(`❌ Erro ao sincronizar ${patientData.name}:`, err.message);
            errorCount++;
        }
    }

    console.log('\n✅ Sincronização concluída!');
    console.log(`   Pacientes criados: ${createdPatients}`);
    console.log(`   Pacientes atualizados: ${updatedPatients}`);
    console.log(`   Exames criados: ${createdExams}`);
    console.log(`   Exames atualizados: ${updatedExams}`);
    console.log(`   Imagens criadas: ${createdImages}`);
    console.log(`   Erros: ${errorCount}`);

    await prisma.$disconnect();
}

sync().catch(console.error);
