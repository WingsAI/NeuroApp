import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const patientCount = await prisma.patient.count();
    const examCount = await prisma.exam.count();
    const reportCount = await prisma.medicalReport.count();

    console.log('--- DATABASE COUNTS ---');
    console.log('Patients:', patientCount);
    console.log('Exams:', examCount);
    console.log('Medical Reports:', reportCount);
    console.log('-----------------------');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
