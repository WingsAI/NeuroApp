const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    const patients = await prisma.patient.findMany({
        where: {
            name: {
                contains: 'Josias',
                mode: 'insensitive'
            }
        }
    });

    console.log('Found patients:', JSON.stringify(patients, null, 2));

    await prisma.$disconnect();
}

main();
