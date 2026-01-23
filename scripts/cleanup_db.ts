import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting database cleanup...');

    const deletedImages = await prisma.patientImage.deleteMany({});
    console.log(`Deleted ${deletedImages.count} patient images.`);

    const deletedPatients = await prisma.patient.deleteMany({});
    console.log(`Deleted ${deletedPatients.count} patients.`);

    console.log('Database cleanup completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
