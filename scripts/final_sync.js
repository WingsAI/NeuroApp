const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

async function main() {
    console.log("🚀 Iniciando Sincronização Final Corrigida...");

    if (!fs.existsSync(MAPPING_PATH)) {
        console.error("❌ Mapping não encontrado!");
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));

    // Agrupa por paciente e garante que o exam_id esteja presente
    const groups = {};
    for (const [folderKey, data] of Object.entries(mapping)) {
        if (!data.patient_name) continue;
        const name = data.patient_name.trim();

        if (!groups[name]) groups[name] = [];

        // Se o exam_id não estiver no objeto, extrai do folderKey (ex: NOME_ID -> ID)
        if (!data.exam_id) {
            data.exam_id = folderKey.split('_').pop();
        }

        groups[name].push(data);
    }

    const names = Object.keys(groups);
    console.log(`📊 Total de entradas no mapping: ${Object.keys(mapping).length}`);
    console.log(`👥 Pacientes únicos para processar: ${names.length}`);

    let updatedCount = 0;

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const exams = groups[name];

        try {
            // Busca paciente existente
            let patient = await prisma.patient.findFirst({
                where: { name: { equals: name, mode: 'insensitive' } }
            });

            // Pega o melhor registro de metadados disponível
            const metaSource = exams.find(e => e.birthday || e.cpf) || exams[0];

            let birthDate = null;
            if (metaSource.birthday) {
                const d = new Date(metaSource.birthday);
                if (!isNaN(d.getTime())) {
                    // Correção de anos impossíveis (ex: 7957 -> 1957)
                    if (d.getFullYear() > 2026) {
                        d.setFullYear(d.getFullYear() - 6000);
                    }
                    birthDate = d;
                }
            }

            const patientData = {
                name: name,
                cpf: metaSource.cpf || null,
                birthDate: birthDate,
                gender: metaSource.gender || null,
                underlyingDiseases: metaSource.underlying_diseases || null,
                ophthalmicDiseases: metaSource.ophthalmic_diseases || null,
            };

            if (!patient) {
                patient = await prisma.patient.create({ data: patientData });
                console.log(`[${i + 1}/${names.length}] ✨ Novo: ${name}`);
            } else {
                // Atualiza sempre para garantir que dados novos (doenças, etc) entrem
                const updates = {};
                if (patientData.cpf && patient.cpf !== patientData.cpf) updates.cpf = patientData.cpf;
                if (patientData.birthDate && (!patient.birthDate || patient.birthDate.getTime() !== patientData.birthDate.getTime())) {
                    updates.birthDate = patientData.birthDate;
                }
                if (patientData.gender && patient.gender !== patientData.gender) updates.gender = patientData.gender;
                if (patientData.underlyingDiseases) updates.underlyingDiseases = patientData.underlyingDiseases;
                if (patientData.ophthalmicDiseases) updates.ophthalmicDiseases = patientData.ophthalmicDiseases;

                if (Object.keys(updates).length > 0) {
                    patient = await prisma.patient.update({ where: { id: patient.id }, data: updates });
                    console.log(`[${i + 1}/${names.length}] 🔄 Atualizado: ${name}`);
                }
            }

            // Sincroniza exames deste paciente
            for (const examData of exams) {
                const examId = examData.exam_id;
                if (!examId) continue;

                let exam = await prisma.exam.findFirst({ where: { eyerCloudId: examId } });

                const examObj = {
                    eyerCloudId: examId,
                    examDate: new Date(examData.exam_date),
                    location: examData.clinic_name || "Phelcom EyeR Cloud",
                    patientId: patient.id,
                    status: 'pending'
                };

                if (!exam) {
                    exam = await prisma.exam.create({ data: examObj });
                } else {
                    // Sempre atualiza o vínculo do paciente caso tenha mudado
                    await prisma.exam.update({ where: { id: exam.id }, data: examObj });
                }

                // Imagens
                for (const img of (examData.images || [])) {
                    if (!img.bytescale_url) continue;

                    const existingImg = await prisma.examImage.findFirst({ where: { url: img.bytescale_url } });
                    if (!existingImg) {
                        await prisma.examImage.create({
                            data: {
                                url: img.bytescale_url,
                                fileName: img.filename,
                                type: 'COLOR',
                                examId: exam.id
                            }
                        });
                    } else if (existingImg.examId !== exam.id) {
                        await prisma.examImage.update({ where: { id: existingImg.id }, data: { examId: exam.id } });
                    }
                }
            }
            updatedCount++;
        } catch (e) {
            console.error(`❌ Erro em ${name}:`, e.message);
        }
    }

    console.log(`✅ Sincronização concluída: ${updatedCount} pacientes processados.`);
    await prisma.$disconnect();
}

main().catch(console.error);
