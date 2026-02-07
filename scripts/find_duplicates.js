const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDuplicates() {
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: { report: true, images: true }
            }
        }
    });

    const nameMap = {};
    patients.forEach(p => {
        const normalizedName = p.name.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove acentos
        if (!nameMap[normalizedName]) nameMap[normalizedName] = [];
        nameMap[normalizedName].push(p);
    });

    console.log('--- ANÁLISE DE DUPLICADOS POR NOME ---');
    let totalDups = 0;
    for (const name in nameMap) {
        if (nameMap[name].length > 1) {
            totalDups++;
            console.log(`\n👤 Paciente: ${name} (${nameMap[name].length} registros)`);
            nameMap[name].forEach(p => {
                const hasEyerId = p.exams.some(e => e.eyerCloudId) ? 'SIM' : 'NÃO';
                const hasReport = p.exams.some(e => e.report !== null) ? 'SIM' : 'NÃO';
                const examCount = p.exams.length;
                console.log(`  - ID: ${p.id.padEnd(25)} | EyerID: ${hasEyerId} | Laudo: ${hasReport} | Exames: ${examCount}`);
            });
        }
    }

    console.log(`\nTotal de grupos duplicados: ${totalDups}`);
}

findDuplicates()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
