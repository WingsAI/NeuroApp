const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    const total = await prisma.patient.count();
    console.log('Total no DB:', total);

    const pending = await prisma.patient.count({ where: { status: 'pending' } });
    console.log('Pendentes:', pending);

    const completed = await prisma.patient.count({ where: { status: 'completed' } });
    console.log('Completos:', completed);

    const inAnalysis = await prisma.patient.count({ where: { status: 'in_analysis' } });
    console.log('Em análise:', inAnalysis);

    await prisma.$disconnect();
}

main();
