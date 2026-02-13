const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();

    const names = ['APARECIDO TERUEL MARTINS', 'GILBERTO TERUEL', 'ANA FERREIRA BELIZARIO', 'MARIA ALVES DE OLIVEIRA'];

    for (const name of names) {
        console.log(`\n--- Patient: ${name} ---`);
        const patients = await prisma.patient.findMany({
            where: { name: { contains: name.split(' ')[0], mode: 'insensitive' } },
            include: {
                exams: {
                    include: {
                        report: true
                    }
                }
            }
        });

        for (const p of patients) {
            if (p.name.toUpperCase().includes(name.toUpperCase()) || name.toUpperCase().includes(p.name.toUpperCase())) {
                console.log(`ID: ${p.id}, CPF: ${p.cpf}`);
                p.exams.forEach(e => {
                    console.log(`  Exam Date: ${e.examDate}, Location: ${e.location}, EyerID: ${e.eyerCloudId}`);
                    if (e.report) {
                        console.log(`    Report ID: ${e.report.id}, CreatedAt: ${e.report.createdAt}`);
                        console.log(`    SelectedImages: ${JSON.stringify(e.report.selectedImages)}`);
                    } else {
                        console.log(`    No report found.`);
                    }
                });
            }
        }
    }

    await prisma.$disconnect();
}

main();
