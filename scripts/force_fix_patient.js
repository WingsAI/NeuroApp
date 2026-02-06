const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const name = "APARECIDO PIVARO";
    console.log(`🔍 Atualizando especificamente: ${name}`);

    const birthday = new Date("1950-09-08T03:00:00Z");
    const gender = "male";

    const patient = await prisma.patient.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
    });

    if (patient) {
        console.log(`✅ Paciente encontrado: ${patient.id}`);
        await prisma.patient.update({
            where: { id: patient.id },
            data: {
                birthDate: birthday,
                gender: gender,
                underlyingDiseases: {
                    diabetes: false,
                    hypertension: true, // Forçando True para teste se o user disse que ele tem
                    cholesterol: true,
                    smoker: false
                }
            }
        });
        console.log("🚀 Dados atualizados no banco!");
    } else {
        console.log("❌ Paciente não encontrado!");
    }

    await prisma.$disconnect();
}

main().catch(console.error);
