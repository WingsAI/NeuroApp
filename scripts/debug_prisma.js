const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Fetching patients...');
        const patients = await prisma.patient.findMany({
            include: {
                images: true,
                report: true,
                referral: true,
            },
        });
        console.log('Success! Found', patients.length, 'patients.');
        const firstWithReport = patients.find(p => p.report);
        if (firstWithReport) {
            console.log('Report found for patient', firstWithReport.id);
            console.log('Report details:', JSON.stringify(firstWithReport.report, null, 2));
        } else {
            console.log('No patients with reports found.');
        }
    } catch (err) {
        console.error('FATAL ERROR fetching patients:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
