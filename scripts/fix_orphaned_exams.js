const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

async function fixIds() {
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));

    // Cria mapa de Nome -> EyerID para busca rápida
    const nameToIdMap = {};
    for (const key in mapping) {
        const item = mapping[key];
        const normalizedName = item.patient_name.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const eyerId = item.exam_id || key.split('_').pop();

        if (!nameToIdMap[normalizedName]) nameToIdMap[normalizedName] = new Set();
        nameToIdMap[normalizedName].add(eyerId);
    }

    const patients = await prisma.patient.findMany({
        include: { exams: true }
    });

    console.log('--- RECONECTANDO IDS DO EYERCLOUD ---');
    let fixedExams = 0;

    for (const p of patients) {
        const normalizedName = p.name.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const possibleIds = nameToIdMap[normalizedName];

        for (const exam of p.exams) {
            if (!exam.eyerCloudId) {
                let foundId = null;

                // 1. Tenta extrair do ID do paciente se for formato hexadecimal longo
                if (p.id.length >= 8 && /^[0-9a-f]+$/.test(p.id)) {
                    foundId = p.id.substring(0, 8);
                }
                // 2. Se não deu certo, tenta pelo mapa de nomes
                else if (possibleIds && possibleIds.size === 1) {
                    foundId = Array.from(possibleIds)[0].substring(0, 8);
                }

                if (foundId) {
                    await prisma.exam.update({
                        where: { id: exam.id },
                        data: { eyerCloudId: foundId }
                    });
                    fixedExams++;
                    console.log(`✅ [${fixedExams}] Vinculado: ${p.name} -> ${foundId}`);
                }
            }
        }
    }

    console.log(`\nOperação concluída. ${fixedExams} exames vinculados ao EyerCloud.`);
}

fixIds()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
