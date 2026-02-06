const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

async function main() {
    console.log("🚀 INICIANDO SUPER-SYNC DE CORREÇÃO TOTAL");

    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    const examDetails = state.exam_details || {};

    console.log(`📊 Preparando para processar ${Object.keys(examDetails).length} exames.`);

    // 1. Mapear IDs para detalhes corretos
    const realExamMap = {};
    for (const [fullId, details] of Object.entries(examDetails)) {
        realExamMap[fullId.slice(0, 8)] = details;
    }

    let fixedCount = 0;

    // 2. Iterar sobre todos os EXAMES no banco
    const allExams = await prisma.exam.findMany();
    console.log(`🔍 Analisando ${allExams.length} exames no banco de dados...`);

    for (const dbExam of allExams) {
        const id = dbExam.eyerCloudId;
        const realData = realExamMap[id];

        if (!realData) continue;

        const correctName = realData.patient_name;

        try {
            // Busca ou cria o paciente CORRETO
            let birthDate = null;
            if (realData.birthday) {
                const d = new Date(realData.birthday);
                if (!isNaN(d.getTime())) {
                    if (d.getFullYear() > 2026) d.setFullYear(d.getFullYear() - 6000);
                    birthDate = d;
                }
            }

            const pData = {
                name: correctName,
                cpf: realData.cpf || null,
                birthDate: birthDate,
                gender: realData.gender || null,
                underlyingDiseases: realData.underlying_diseases || null,
                ophthalmicDiseases: realData.ophthalmic_diseases || null
            };

            let patient = await prisma.patient.findFirst({
                where: { name: { equals: correctName, mode: 'insensitive' } }
            });

            if (!patient) {
                patient = await prisma.patient.create({ data: pData });
            } else {
                patient = await prisma.patient.update({ where: { id: patient.id }, data: pData });
            }

            // Move o exame para o paciente correto e atualiza local
            await prisma.exam.update({
                where: { id: dbExam.id },
                data: {
                    patientId: patient.id,
                    location: realData.clinic_name || (correctName.includes("ADEMILSON") || correctName.includes("APARECIDO") ? "Jaci" : "Phelcom EyeR Cloud"),
                    examDate: new Date(realData.exam_date)
                }
            });

            fixedCount++;
            if (fixedCount % 20 === 0) console.log(`   ✅ ${fixedCount} exames corrigidos...`);
        } catch (err) {
            console.error(`   ❌ Erro ao corrigir exame ${id} (${correctName}):`, err.message);
        }
    }

    console.log(`\n🎉 SUCESSO! ${fixedCount} exames foram movidos para seus donos corretos.`);

    // Limpeza final: Deletar pacientes que ficaram sem NENHUM exame (os antigos nomes errados)
    const orphans = await prisma.patient.deleteMany({
        where: { exams: { none: {} } }
    });
    console.log(`🧹 Limpeza: ${orphans.count} pacientes "fantasmas" removidos.`);

    await prisma.$disconnect();
}

main().catch(console.error);
