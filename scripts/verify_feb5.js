const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('--- Verificação de Dados (05/02) ---');

    // Busca Margarida
    const margaridas = await prisma.patient.findMany({
        where: { name: { contains: 'MARGARIDA', mode: 'insensitive' } }
    });
    console.log('Margaridas encontradas:', margaridas.length);
    margaridas.forEach(p => console.log(`- ID: ${p.id}, Nome: ${p.name}`));

    // Busca exames de 5 de fevereiro
    const exams5Feb = await prisma.exam.findMany({
        where: {
            examDate: {
                gte: new Date('2026-02-05T00:00:00Z'),
                lt: new Date('2026-02-06T00:00:00Z')
            }
        },
        include: { patient: true }
    });

    console.log('\nExames em 05/02:', exams5Feb.length);
    exams5Feb.forEach(e => {
        console.log(`- Data: ${e.examDate.toISOString()}, Paciente: ${e.patient.name}`);
    });

    const totalPatients = await prisma.patient.count();
    const totalExams = await prisma.exam.count();
    console.log('\nTotais:');
    console.log('- Total Pacientes:', totalPatients);
    console.log('- Total Exames:', totalExams);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
