const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    report: true
                }
            }
        }
    });

    const manualPatients = patients.filter(p =>
        p.exams.length > 0 && p.exams.every(e => e.eyerCloudId === null)
    );

    console.log(`\n=== PACIENTES COMPLETAMENTE MANUAIS (SEM ID EYERCLOUD) ===`);
    manualPatients.forEach(p => {
        const hasReport = p.exams.some(e => e.report !== null);
        console.log(`- ${p.name} | Laudo: ${hasReport ? 'SIM' : 'NÃO'}`);
    });
}

main().finally(() => prisma.$disconnect());
