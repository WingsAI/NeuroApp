const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function compare() {
    const mappingPath = path.join('e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_final.json');
    const mappingData = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));

    const dbPatients = await prisma.patient.findMany({
        select: { name: true, birthDate: true }
    });

    const dbKeys = new Set(dbPatients.map(p => {
        const name = p.name.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const date = p.birthDate ? new Date(p.birthDate).toISOString().split('T')[0] : 'unknown';
        return `${name}|${date}`;
    }));

    let missingCount = 0;
    const missingExamples = [];

    for (const [key, data] of Object.entries(mappingData)) {
        const name = (data.patient_name || 'Unknown').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const bday = data.birthday ? new Date(data.birthday).toISOString().split('T')[0] : 'unknown';
        const searchKey = `${name}|${bday}`;

        if (!dbKeys.has(searchKey)) {
            missingCount++;
            if (missingExamples.length < 10) {
                missingExamples.push({ name: data.patient_name, bday: data.birthday, folder: key });
            }
        }
    }

    console.log('--- COMPARISON ---');
    console.log('Mapping entries:', Object.keys(mappingData).length);
    console.log('Unique Patients in DB:', dbPatients.length);
    console.log('Missing from DB:', missingCount);
    console.log('Examples of missing:');
    console.log(JSON.stringify(missingExamples, null, 2));

    await prisma.$disconnect();
}

compare();
