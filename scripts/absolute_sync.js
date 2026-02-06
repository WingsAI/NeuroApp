const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

async function main() {
    console.log("🔥 INICIANDO RE-SINCRONIZAÇÃO ABSOLUTA (FONTE: DOWNLOAD_STATE)");

    if (!fs.existsSync(STATE_PATH) || !fs.existsSync(MAPPING_PATH)) {
        console.error("❌ Arquivos de dados não encontrados!");
        return;
    }

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    const examDetails = state.exam_details || {};

    console.log(`📊 Processando ${Object.keys(examDetails).length} exames do state...`);

    let processed = 0;

    for (const [examIdFull, details] of Object.entries(examDetails)) {
        const name = details.patient_name?.trim();
        if (!name) continue;

        const examIdShort = examIdFull.slice(0, 8);

        try {
            // 1. Busca ou Cria Paciente com metadados do STATE (Fonte da Verdade)
            let birthDate = null;
            if (details.birthday) {
                const d = new Date(details.birthday);
                if (!isNaN(d.getTime())) {
                    if (d.getFullYear() > 2026) d.setFullYear(d.getFullYear() - 6000);
                    birthDate = d;
                }
            }

            const patientData = {
                name: name,
                cpf: details.cpf || null,
                birthDate: birthDate,
                gender: details.gender || null,
                underlyingDiseases: details.underlying_diseases || null,
                ophthalmicDiseases: details.ophthalmic_diseases || null,
            };

            let patient = await prisma.patient.findFirst({
                where: { name: { equals: name, mode: 'insensitive' } }
            });

            if (!patient) {
                patient = await prisma.patient.create({ data: patientData });
            } else {
                // Atualiza SEMPRE para corrigir nomes/metadados errados
                patient = await prisma.patient.update({
                    where: { id: patient.id },
                    data: patientData
                });
            }

            // 2. Sincroniza o Exame
            let exam = await prisma.exam.findFirst({
                where: { eyerCloudId: examIdShort }
            });

            const examObj = {
                eyerCloudId: examIdShort,
                examDate: new Date(details.exam_date),
                location: details.clinic_name || "Phelcom EyeR Cloud",
                patientId: patient.id,
                status: 'pending'
            };

            if (!exam) {
                exam = await prisma.exam.create({ data: examObj });
            } else {
                exam = await prisma.exam.update({
                    where: { id: exam.id },
                    data: examObj
                });
            }

            // 3. Vincula Imagens do MAPPING (Buscando pela pasta/ID correto)
            // Procura no mapping a entrada que REALMENTE tem esse examIdShort, independente do nome que esteja lá
            let mappingData = null;
            for (const [folderKey, mData] of Object.entries(mapping)) {
                if (folderKey.endsWith(examIdShort) || mData.exam_id === examIdShort) {
                    mappingData = mData;
                    break;
                }
            }

            if (mappingData && mappingData.images) {
                for (const img of mappingData.images) {
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
                    } else {
                        // Garante que a imagem aponte para o exame correto (corrigindo trocas)
                        await prisma.examImage.update({
                            where: { id: existingImg.id },
                            data: { examId: exam.id }
                        });
                    }
                }
            }

            processed++;
            if (processed % 10 === 0) console.log(`  ✅ Processados ${processed} exames...`);

        } catch (e) {
            console.error(`  ❌ Erro no exame ${examIdFull} (${name}):`, e.message);
        }
    }

    console.log(`\n🎉 RE-SINCRONIZAÇÃO CONCLUÍDA! ${processed} exames vinculados corretamente.`);
    await prisma.$disconnect();
}

main().catch(console.error);
