/**
 * Fix Metadata Offline - Corrige dados usando a API do EyerCloud
 * ===============================================================
 * 
 * Este script atualiza os metadados dos pacientes:
 * 1. Conecta ao EyerCloud (requer login)
 * 2. Busca os dados completos de cada paciente
 * 3. Atualiza o bytescale_mapping_cleaned.json
 * 4. Sincroniza com o banco de dados
 * 
 * Uso:
 *   node scripts/fix_all_data.js              # Preview
 *   node scripts/fix_all_data.js --execute    # Executa
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Paths
const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

function loadJSON(filepath) {
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveJSON(filepath, data) {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

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

async function main() {
    console.log('='.repeat(70));
    console.log('🔧 Fix All Data - Corrige dados do NeuroApp');
    console.log('='.repeat(70));

    const execute = process.argv.includes('--execute');
    if (!execute) {
        console.log('⚠️  MODO PREVIEW - use --execute para aplicar mudanças\n');
    }

    // Load mapping
    const mapping = loadJSON(MAPPING_PATH);
    if (!mapping) {
        console.error('❌ bytescale_mapping_cleaned.json não encontrado!');
        return;
    }

    // Load state
    const state = loadJSON(STATE_PATH);
    const stateDetails = state?.exam_details || {};

    console.log(`📊 Mapping: ${Object.keys(mapping).length} entradas`);
    console.log(`📊 State: ${Object.keys(stateDetails).length} exames\n`);

    // Primeiro, vamos atualizar o mapping com os dados do state
    console.log('📋 Atualizando mapping com dados do state...\n');

    let mappingUpdated = 0;
    for (const [folderKey, examData] of Object.entries(mapping)) {
        const examIdShort = examData.exam_id || folderKey.split('_').pop();

        // Busca no state pelo ID
        let stateData = null;
        for (const [fullId, details] of Object.entries(stateDetails)) {
            if (fullId.startsWith(examIdShort) || fullId.includes(examIdShort)) {
                stateData = details;
                break;
            }
        }

        if (stateData) {
            // Copia dados do state para o mapping
            if (stateData.birthday && !examData.birthday) {
                mapping[folderKey].birthday = stateData.birthday;
                mappingUpdated++;
            }
            if (stateData.cpf && !examData.cpf) {
                mapping[folderKey].cpf = stateData.cpf;
                mappingUpdated++;
            }
            if (stateData.gender && !examData.gender) {
                mapping[folderKey].gender = stateData.gender;
                mappingUpdated++;
            }
            if (stateData.exam_date && !examData.exam_date) {
                mapping[folderKey].exam_date = stateData.exam_date;
                mappingUpdated++;
            }
            if (stateData.underlying_diseases && !examData.underlying_diseases) {
                mapping[folderKey].underlying_diseases = stateData.underlying_diseases;
                mappingUpdated++;
            }
            if (stateData.ophthalmic_diseases && !examData.ophthalmic_diseases) {
                mapping[folderKey].ophthalmic_diseases = stateData.ophthalmic_diseases;
                mappingUpdated++;
            }
            if (stateData.clinic_name && (!examData.clinic_name || examData.clinic_name === 'Phelcom EyeR Cloud')) {
                mapping[folderKey].clinic_name = stateData.clinic_name;
            }
        }
    }

    console.log(`   Campos atualizados no mapping: ${mappingUpdated}`);

    if (execute) {
        saveJSON(MAPPING_PATH, mapping);
        console.log('   ✅ Mapping salvo!\n');
    }

    // Agora sincroniza com o banco
    console.log('📋 Sincronizando com o banco de dados...\n');

    // Agrupa por paciente
    const patientGroups = {};
    for (const [folderKey, examData] of Object.entries(mapping)) {
        const name = examData.patient_name?.trim() || 'Desconhecido';
        const birthday = examData.birthday || null;

        const normalizedName = name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const birthKey = birthday ? parseDate(birthday)?.toISOString()?.split('T')[0] || 'unknown' : 'unknown';
        const uniqueKey = `${normalizedName}|${birthKey}`;

        if (!patientGroups[uniqueKey]) {
            patientGroups[uniqueKey] = {
                name: name,
                cpf: examData.cpf || null,
                birthDate: parseDate(examData.birthday),
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

        patientGroups[uniqueKey].exams.push({
            eyerCloudId: examData.exam_id || folderKey.split('_').pop(),
            examDate: parseDate(examData.exam_date) || new Date(),
            location: examData.clinic_name || 'Phelcom EyeR Cloud',
            technicianName: 'EyerCloud Sync',
            images: examData.images || []
        });
    }

    const uniquePatients = Object.values(patientGroups);
    console.log(`   Pacientes únicos: ${uniquePatients.length}`);

    // Estatísticas
    const stats = {
        withCPF: uniquePatients.filter(p => p.cpf).length,
        withBirthDate: uniquePatients.filter(p => p.birthDate).length,
        withGender: uniquePatients.filter(p => p.gender).length,
        withDiseases: uniquePatients.filter(p => p.underlyingDiseases && Object.values(p.underlyingDiseases).some(v => v)).length
    };

    console.log(`   Com CPF: ${stats.withCPF}`);
    console.log(`   Com Data de Nascimento: ${stats.withBirthDate}`);
    console.log(`   Com Sexo: ${stats.withGender}`);
    console.log(`   Com Doenças: ${stats.withDiseases}\n`);

    if (!execute) {
        console.log('⚠️  Use --execute para aplicar mudanças no banco.\n');
        await prisma.$disconnect();
        return;
    }

    // Sincroniza com banco
    let createdPatients = 0;
    let updatedPatients = 0;
    let createdExams = 0;
    let updatedExams = 0;
    let createdImages = 0;

    for (const patientData of uniquePatients) {
        try {
            // Busca paciente existente
            let patient = await prisma.patient.findFirst({
                where: {
                    name: { equals: patientData.name, mode: 'insensitive' }
                }
            });

            if (!patient) {
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
                // Atualiza paciente existente
                const updateData = {};
                if (!patient.cpf && patientData.cpf) updateData.cpf = patientData.cpf;
                if (!patient.birthDate && patientData.birthDate) updateData.birthDate = patientData.birthDate;
                if (!patient.gender && patientData.gender) updateData.gender = patientData.gender;
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

            // Sincroniza exames
            for (const examData of patientData.exams) {
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
                    // Atualiza exame se necessário
                    const examUpdate = {};
                    if (exam.patientId !== patient.id) examUpdate.patientId = patient.id;
                    if (exam.location !== examData.location && examData.location !== 'Phelcom EyeR Cloud') {
                        examUpdate.location = examData.location;
                    }
                    if (Object.keys(examUpdate).length > 0) {
                        exam = await prisma.exam.update({
                            where: { id: exam.id },
                            data: examUpdate
                        });
                        updatedExams++;
                    }
                }

                // Sincroniza imagens
                for (const img of examData.images) {
                    if (!img.bytescale_url) continue;

                    const existingImage = await prisma.examImage.findFirst({
                        where: { url: img.bytescale_url }
                    });

                    if (!existingImage) {
                        try {
                            await prisma.examImage.create({
                                data: {
                                    url: img.bytescale_url,
                                    fileName: img.filename || 'image.jpg',
                                    type: img.type || 'COLOR',
                                    examId: exam.id
                                }
                            });
                            createdImages++;
                        } catch (err) {
                            // Ignora erros de duplicação
                        }
                    }
                }
            }
        } catch (err) {
            console.error(`   ❌ Erro: ${patientData.name}: ${err.message}`);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ CONCLUÍDO!');
    console.log('='.repeat(70));
    console.log(`   Pacientes criados: ${createdPatients}`);
    console.log(`   Pacientes atualizados: ${updatedPatients}`);
    console.log(`   Exames criados: ${createdExams}`);
    console.log(`   Exames atualizados: ${updatedExams}`);
    console.log(`   Imagens criadas: ${createdImages}`);
    console.log('='.repeat(70) + '\n');

    await prisma.$disconnect();
}

main().catch(console.error);
