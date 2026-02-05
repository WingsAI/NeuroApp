const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDetails() {
    const names = ['NILSON HELIO LEAO', 'FRANCISCO ELIVAN DE SOUSA', 'ANTONIA PAULA PEREIRA DE OLIVEIRA'];

    for (const name of names) {
        const patients = await prisma.patient.findMany({
            where: { name },
            include: {
                exams: {
                    include: { report: true }
                }
            }
        });

        console.log(`\n=== Detalhes: ${name} ===`);
        patients.forEach((p, i) => {
            const reportsCount = p.exams.filter(e => e.report).length;
            const mappedExams = p.exams.filter(e => e.eyerCloudId !== null).length;
            console.log(`Registro ${i + 1}: ID ${p.id} | Exames: ${p.exams.length} | Com Laudo: ${reportsCount} | Mapeados: ${mappedExams}`);
        });
    }
}

checkDetails().finally(() => prisma.$disconnect());
