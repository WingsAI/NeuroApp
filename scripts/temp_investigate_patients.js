const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    const names = ["ANA FERREIRA BELIZARIO", "APARECIDO TERUEL MARTINS", "APARECIDO TERUEL"];

    for (const name of names) {
        const patients = await prisma.patient.findMany({
            where: {
                name: {
                    contains: name.split(' ')[0],
                    mode: 'insensitive'
                }
            }
        });

        console.log(`Searching for "${name}":`);
        patients.forEach(p => {
            if (p.name.toUpperCase().includes(name.toUpperCase()) || name.toUpperCase().includes(p.name.toUpperCase())) {
                console.log(`- ID: ${p.id}, Name: ${p.name}, CPF: ${p.cpf}`);
            }
        });
    }

    await prisma.$disconnect();
}

main();
