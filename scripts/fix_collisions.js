const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

function generateId() {
    return 'cml' + crypto.randomBytes(10).toString('hex');
}

async function main() {
    console.log("🚀 INICIANDO CORREÇÃO CIRÚRGICA DE VÍNCULOS");

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    const examDetails = state.exam_details || {};

    let processed = 0;

    for (const [fullId, details] of Object.entries(examDetails)) {
        const name = details.patient_name?.trim();
        if (!name) continue;

        try {
            // 1. Localiza/Atualiza Paciente
            let patient = await prisma.patient.findFirst({
                where: { name: { equals: name, mode: 'insensitive' } }
            });

            // Se não existir, o super_sync anterior pode ter deletado. Recriamos.
            if (!patient) {
                let birthDate = null;
                if (details.birthday) {
                    const d = new Date(details.birthday);
                    if (!isNaN(d.getTime())) {
                        if (d.getFullYear() > 2026) d.setFullYear(d.getFullYear() - 6000);
                        birthDate = d;
                    }
                }
                patient = await prisma.patient.create({
                    data: {
                        id: generateId(),
                        name: name,
                        cpf: details.cpf || null,
                        birthDate: birthDate,
                        gender: details.gender || null,
                        underlyingDiseases: details.underlying_diseases || null,
                        ophthalmicDiseases: details.ophthalmic_diseases || null,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                });
            }

            // 2. Localiza/Cria Exame com ID Completo
            let exam = await prisma.exam.findFirst({
                where: { eyerCloudId: fullId }
            });

            if (!exam) {
                // Tenta achar pelo ID curto que pertença a este paciente especificamente
                exam = await prisma.exam.findFirst({
                    where: {
                        eyerCloudId: fullId.slice(0, 8),
                        patientId: patient.id
                    }
                });
            }

            const examObj = {
                eyerCloudId: fullId,
                examDate: new Date(details.exam_date),
                location: (name.includes("ADEMILSON") || name.includes("APARECIDO")) ? "Jaci" : (details.clinic_name || "Phelcom EyeR Cloud"),
                technicianName: "EyerCloud Sync",
                patientId: patient.id,
                status: 'pending',
                updatedAt: new Date()
            };

            if (!exam) {
                exam = await prisma.exam.create({
                    data: { ...examObj, id: generateId(), createdAt: new Date() }
                });
            } else {
                exam = await prisma.exam.update({ where: { id: exam.id }, data: examObj });
            }

            // 3. Vínculo Cirúrgico de Imagens
            // Busca no mapping pela chave que contenha o NOME e o ID curto
            const shortId = fullId.slice(0, 8);
            const sanitizedName = name.replace(/\s+/g, '_').toUpperCase();

            let mappingEntry = null;
            // Tenta busca exata pela chave
            for (const [folderKey, mData] of Object.entries(mapping)) {
                const folderKeyUpper = folderKey.toUpperCase();
                if (folderKeyUpper.includes(shortId) && folderKeyUpper.includes(sanitizedName.slice(0, 10))) {
                    mappingEntry = mData;
                    break;
                }
            }

            if (mappingEntry && mappingEntry.images) {
                for (const img of mappingEntry.images) {
                    const existingImg = await prisma.examImage.findFirst({ where: { url: img.bytescale_url } });
                    if (!existingImg) {
                        await prisma.examImage.create({
                            data: {
                                id: generateId(),
                                url: img.bytescale_url,
                                fileName: img.filename,
                                type: 'COLOR',
                                examId: exam.id
                            }
                        });
                    } else {
                        await prisma.examImage.update({
                            where: { id: existingImg.id },
                            data: { examId: exam.id }
                        });
                    }
                }
            }

            processed++;
            if (processed % 50 === 0) console.log(`   ✅ ${processed} exames processados...`);

        } catch (err) {
            console.error(`   ❌ Erro em ${fullId} (${name}):`, err.message);
        }
    }

    console.log(`\n🎉 SUCESSO! Correção cirúrgica concluída.`);
    await prisma.$disconnect();
}

main().catch(console.error);
