const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixLocationsAndAdriana() {
    console.log("🚀 Iniciando correções de localização e metadados...");

    // 1. Corrigir Localizações baseadas na data
    const exams = await prisma.exam.findMany();
    let locationUpdates = 0;

    for (const exam of exams) {
        const date = new Date(exam.examDate);
        if (isNaN(date.getTime())) continue;

        const day = date.getUTCDate();
        const month = date.getUTCMonth() + 1; // 1-indexed
        const year = date.getUTCFullYear();

        let newLocation = null;

        if (year === 2026) {
            if (month === 1) {
                if (day <= 15) {
                    newLocation = 'Tauá-CE';
                } else if (day >= 27 && day <= 31) {
                    newLocation = 'Jaci-SP';
                }
            } else if (month === 2) {
                if (day >= 2 && day <= 6) {
                    newLocation = 'Campos do Jordão-SP';
                }
            }
        }

        if (newLocation && (exam.location !== newLocation)) {
            await prisma.exam.update({
                where: { id: exam.id },
                data: { location: newLocation }
            });
            locationUpdates++;
        }
    }
    console.log(`✅ ${locationUpdates} exames tiveram a localização corrigida.`);

    // 2. Corrigir metadados da Adriana Carvalho Fernandes
    console.log("🧬 Atualizando metadados da Adriana Carvalho Fernandes...");
    const adriana = await prisma.patient.findFirst({
        where: { name: { contains: 'ADRIANA CARVALHO FERNANDES', mode: 'insensitive' } }
    });

    if (adriana) {
        await prisma.patient.update({
            where: { id: adriana.id },
            data: {
                underlyingDiseases: {
                    diabetes: false,
                    hypertension: true,
                    cholesterol: true,
                    smoker: false
                },
                updatedAt: new Date()
            }
        });
        console.log("✅ Metadados da Adriana (Hipertensão e Colesterol) atualizados com sucesso.");
    } else {
        console.log("❌ Adriana não encontrada no banco.");
    }

    console.log("🎉 Todas as correções foram aplicadas.");
}

fixLocationsAndAdriana()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
