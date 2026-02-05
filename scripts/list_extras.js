const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function findExtraPatients() {
    try {
        const mappingPath = path.join('e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_cleaned.json');
        const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

        const mappedIds = new Set();
        for (const [key, m] of Object.entries(mappingData)) {
            mappedIds.add(key);
            if (m.exam_id) mappedIds.add(m.exam_id);
        }

        const patients = await prisma.patient.findMany({
            include: {
                exams: {
                    include: {
                        report: true
                    }
                }
            }
        });

        const extras = patients.filter(p => !p.exams.some(e => mappedIds.has(e.eyerCloudId)));

        console.log(`\n=== RELATÓRIO DE PACIENTES EXTRAS (NO DB MAS NÃO NO MAPPING) ===`);
        console.log(`Total de pacientes extras: ${extras.length}`);

        extras.forEach(p => {
            const hasReport = p.exams.some(e => e.report !== null);
            if (hasReport) {
                console.log(`[COM LAUDO] ${p.name}`);
            } else {
                // console.log(`[SEM LAUDO] ${p.name}`);
            }
        });

    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

findExtraPatients();
