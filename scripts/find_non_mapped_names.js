const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
    const mappingPath = path.join('e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_cleaned.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

    // Nomes normalizados no mapping
    const mappedNames = new Set();
    for (const m of Object.values(mappingData)) {
        mappedNames.add(m.patient_name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());
    }

    const patients = await prisma.patient.findMany({
        select: { name: true }
    });

    console.log(`\n=== PACIENTES NO DB QUE NÃO ESTÃO NO MAPPING ATUAL ===`);
    let count = 0;
    for (const p of patients) {
        const normName = p.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (!mappedNames.has(normName)) {
            console.log(`- ${p.name}`);
            count++;
        }
    }
    console.log(`\nTotal: ${count}`);
}

main().finally(() => prisma.$disconnect());
