const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        console.log('--- DB STATE ---');
        const pc = await prisma.patient.count();
        const ec = await prisma.exam.count();
        console.log('Total Patients:', pc);
        console.log('Total Exams:', ec);

        const p = await prisma.patient.findFirst({
            where: { name: { contains: 'MARIA DE FATIMA DO NASCIMENTO', mode: 'insensitive' } },
            include: { exams: true }
        });

        if (p) {
            console.log('\nMaria de Fatima found:');
            console.log('Patient ID:', p.id);
            console.log('Exams found:', p.exams.length);
            p.exams.forEach(e => {
                console.log(` - Exam ID: ${e.id} | EyerCloudID: ${e.eyerCloudId}`);
            });
        } else {
            console.log('\nMaria de Fatima NOT FOUND in DB');
        }

        console.log('\n--- SAMPLE PATIENTS ---');
        const samples = await prisma.patient.findMany({ take: 10 });
        samples.forEach(s => {
            console.log(`ID: ${s.id.padEnd(25)} | Name: ${s.name}`);
        });

    } catch (err) {
        console.error('Error during check:', err);
    } finally {
        await prisma.$disconnect();
    }
}

check();
