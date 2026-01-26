const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const patients = await prisma.patient.findMany({
        select: { id: true, name: true, underlyingDiseases: true }
    });

    console.log('--- Patients with comorbidities in DB ---');
    let count = 0;
    patients.forEach(p => {
        const d = p.underlyingDiseases;
        if (d && (d.diabetes || d.hypertension || d.cholesterol || d.smoker)) {
            console.log(`[${p.id}] ${p.name}: ${JSON.stringify(d)}`);
            count++;
        }
    });
    console.log(`Total: ${count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
