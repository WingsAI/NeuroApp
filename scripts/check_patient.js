const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
    const patient = await p.patient.findFirst({
        where: { name: { contains: 'APARECIDO PIVARO' } },
        include: { exams: { include: { images: true } } }
    });
    console.log(JSON.stringify(patient, null, 2));
    await p.$disconnect();
}

main().catch(e => console.error(e));
