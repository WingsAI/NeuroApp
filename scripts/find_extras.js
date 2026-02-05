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

        console.log('--- BUSCANDO PACIENTES EXTRAS (FORA DO MAPPING) ---');

        const extras = [];
        for (const p of patients) {
            // Verifica se algum exame deste paciente está no mapping
            const isMapped = p.exams.some(e => mappedIds.has(e.eyerCloudId));

            if (!isMapped) {
                const hasReport = p.exams.some(e => e.report !== null);
                extras.push({
                    name: p.name,
                    id: p.id,
                    examsCount: p.exams.length,
                    hasReport: hasReport
                });
            }
        }

        console.log(`Encontrados ${extras.length} pacientes extras.`);
        extras.forEach(e => {
            console.log(`- Nome: ${e.name} | Laudo: ${e.hasReport ? 'SIM' : 'NÃO'} | Exames: ${e.examsCount}`);
        });

    } catch (err) {
        console.error('Erro:', err);
    } finally {
        await prisma.$disconnect();
    }
}

findExtraPatients();
