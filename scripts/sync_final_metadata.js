const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

async function main() {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const details = state.exam_details || {};

    console.log("🚀 Iniciando atualização de pacientes com metadados corrigidos...");

    let updated = 0;

    for (const [examId, data] of Object.entries(details)) {
        if (!data.patient_name) continue;

        // Busca paciente pelo nome exato
        const patient = await prisma.patient.findFirst({
            where: { name: { equals: data.patient_name, mode: 'insensitive' } }
        });

        if (patient) {
            let birthDate = null;
            if (data.birthday) {
                const d = new Date(data.birthday);
                if (!isNaN(d.getTime())) {
                    if (d.getFullYear() > 2026) d.setFullYear(d.getFullYear() - 6000);
                    birthDate = d;
                }
            }

            await prisma.patient.update({
                where: { id: patient.id },
                data: {
                    cpf: data.cpf || patient.cpf,
                    gender: data.gender || patient.gender,
                    birthDate: birthDate || patient.birthDate,
                    underlyingDiseases: data.underlying_diseases || patient.underlyingDiseases,
                    ophthalmicDiseases: data.ophthalmic_diseases || patient.ophthalmicDiseases,
                    updatedAt: new Date()
                }
            });

            if (data.patient_name.includes("ADRIANA CARVALHO") || data.patient_name.includes("ADEMILSON ROGERIO")) {
                console.log(`  ✅ Atualizado: ${data.patient_name} (CPF: ${data.cpf})`);
            }
            updated++;
        }
    }

    console.log(`\n🎉 Concluído! ${updated} pacientes atualizados.`);
    await prisma.$disconnect();
}

main().catch(console.error);
