const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    // Check a few patients and their images
    const patients = await prisma.patient.findMany({
        take: 5,
        include: { images: true },
        orderBy: { createdAt: 'desc' }
    });

    console.log('Sample of patients with images:');
    patients.forEach(p => {
        console.log(`\n${p.name} (${p.id}):`);
        console.log(`  Images: ${p.images.length}`);
        p.images.slice(0, 2).forEach(img => {
            console.log(`    - ${img.fileName}: ${img.url.substring(0, 60)}...`);
        });
    });

    // Count patients without images
    const patientsWithoutImages = await prisma.patient.count({
        where: { images: { none: {} } }
    });
    console.log(`\nPatients without images: ${patientsWithoutImages}`);

    await prisma.$disconnect();
}

main();
