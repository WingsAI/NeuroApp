const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    const patients = await prisma.patient.findMany({
        where: {
            NOT: {
                cpf: null
            },
            cpf: {
                not: ''
            }
        },
        orderBy: {
            cpf: 'asc'
        }
    });

    const cpfMap = {};
    patients.forEach(p => {
        if (!cpfMap[p.cpf]) {
            cpfMap[p.cpf] = [];
        }
        cpfMap[p.cpf].push(p.name);
    });

    console.log('Duplicate CPFs found in DB:');
    let duplicatesFound = false;
    for (const [cpf, names] of Object.entries(cpfMap)) {
        if (names.length > 1) {
            duplicatesFound = true;
            console.log(`CPF: ${cpf} -> [${names.join(', ')}]`);
        }
    }

    if (!duplicatesFound) {
        console.log('No duplicate CPFs found.');
    }

    await prisma.$disconnect();
}

main();
