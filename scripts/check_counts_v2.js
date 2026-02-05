const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        const patientCount = await prisma.patient.count();
        const examCount = await prisma.exam.count();
        const reportCount = await prisma.medicalReport.count();
        const imageCount = await prisma.examImage.count();

        console.log('--- DATABASE COUNTS ---');
        console.log('Patients (Unique Persons):', patientCount);
        console.log('Exams (Visits):', examCount);
        console.log('Medical Reports:', reportCount);
        console.log('Exam Images:', imageCount);
        console.log('-----------------------');

        const patientsWithMultipleExams = await prisma.$queryRaw`
            SELECT "patientId", COUNT(*) as count 
            FROM "Exam" 
            GROUP BY "patientId" 
            HAVING COUNT(*) > 1
        `;
        console.log('Patients with multiple exams:', patientsWithMultipleExams.length);

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
