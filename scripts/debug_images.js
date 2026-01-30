const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Fetching patients with images...');
        const patients = await prisma.patient.findMany({
            include: {
                images: true,
            },
            take: 5,
        });
        console.log('Found', patients.length, 'patients.');
        patients.forEach(p => {
            console.log(`Patient ${p.id} has ${p.images.length} images.`);
            if (p.images.length > 0) {
                const img = p.images[0];
                console.log(`  - Image ID: ${img.id}, url: ${img.url}, uploadedAt type: ${typeof img.uploadedAt}, value: ${img.uploadedAt}`);
            }
        });
    } catch (err) {
        console.error('FATAL ERROR:', err);
    } finally {
        await prisma.$disconnect();
    }
}

main();
