const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const mappingFile = path.join(__dirname, '..', 'public', 'bytescale_mapping.json');

async function main() {
    console.log('Starting DB push from mapping file...');

    if (!fs.existsSync(mappingFile)) {
        console.error('Mapping file not found.');
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    let updateCount = 0;

    const entries = Object.values(mapping);
    console.log(`Processing ${entries.length} mapping entries...`);

    for (const entry of entries) {
        const { patient_name, cpf, underlying_diseases, ophthalmic_diseases, otherDisease } = entry;

        let patient = null;

        // Try finding by CPF first
        if (cpf && cpf.length > 0) {
            patient = await prisma.patient.findUnique({
                where: { cpf: cpf }
            });
        }

        // Try finding by Name if CPF failed
        if (!patient) {
            patient = await prisma.patient.findFirst({
                where: { name: patient_name }
            });
        }

        if (patient) {
            await prisma.patient.update({
                where: { id: patient.id },
                data: {
                    underlyingDiseases: underlying_diseases || {},
                    ophthalmicDiseases: ophthalmic_diseases || {}
                }
            });
            updateCount++;
            if (updateCount % 10 === 0) console.log(`${updateCount} patients updated...`);
        }
    }

    console.log(`Finished! Total patients updated in DB: ${updateCount}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
