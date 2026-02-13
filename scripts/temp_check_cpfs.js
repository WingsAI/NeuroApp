const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    console.log('Searching for patients with CPF 01464269831:');
    const p1 = await prisma.patient.findMany({
        where: { cpf: '01464269831' }
    });
    console.log(JSON.stringify(p1, null, 2));

    console.log('\nSearching for patients with CPF 88066959320:');
    const p2 = await prisma.patient.findMany({
        where: { cpf: '88066959320' }
    });
    console.log(JSON.stringify(p2, null, 2));

    await prisma.$disconnect();
}

main();
