const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// This script syncs the local bytescale_mapping.json directly to the Database
// Run this locally to update the production database (Railway/Vercel)

async function sync() {
    console.log('Starting Cloud-to-DB Synchronization...');

    // Check if mapping file exists
    const mappingPath = path.join(process.cwd(), 'bytescale_mapping.json');
    if (!fs.existsSync(mappingPath)) {
        console.error('Error: bytescale_mapping.json not found in root directory.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
    const entries = Object.entries(data);
    console.log(`Found ${entries.length} patients in mapping file.`);

    const prisma = new PrismaClient();
    let successCount = 0;
    let errorCount = 0;

    for (const [key, patientData] of entries) {
        const id = patientData.exam_id || key;

        try {
            // Generate a unique CPF if it's missing or duplicate
            let finalCpf = patientData.cpf;
            if (!finalCpf || finalCpf === 'PENDENTE' || finalCpf.trim() === '' || finalCpf === 'null') {
                finalCpf = `AUTO-${id}`;
            }

            // Check for CPF conflicts (same CPF but different ID)
            const conflict = await prisma.patient.findFirst({
                where: {
                    cpf: finalCpf,
                    id: { not: id }
                }
            });

            if (conflict) {
                finalCpf = `CONFLICT-${id}-${Math.random().toString(36).slice(2, 7)}`;
            }

            // We use upsert to create or update
            await prisma.patient.upsert({
                where: { id: id },
                update: {
                    name: patientData.patient_name,
                    cpf: finalCpf,
                    birthDate: new Date(patientData.birthday || new Date()),
                    examDate: new Date(patientData.images?.[0]?.upload_date || new Date()),
                    location: patientData.clinic_name || 'Phelcom EyeR Cloud',
                    gender: patientData.gender || '',
                    technicianName: 'EyerCloud Sync',
                    underlyingDiseases: patientData.underlying_diseases || {},
                    ophthalmicDiseases: patientData.ophthalmic_diseases || {},
                },
                create: {
                    id: id,
                    name: patientData.patient_name,
                    cpf: finalCpf,
                    birthDate: new Date(patientData.birthday || new Date()),
                    examDate: new Date(patientData.images?.[0]?.upload_date || new Date()),
                    location: patientData.clinic_name || 'Phelcom EyeR Cloud',
                    gender: patientData.gender || '',
                    technicianName: 'EyerCloud Sync',
                    underlyingDiseases: patientData.underlying_diseases || {},
                    ophthalmicDiseases: patientData.ophthalmic_diseases || {},
                    status: 'pending'
                }
            });

            // Sync images
            if (patientData.images && patientData.images.length > 0) {
                for (let i = 0; i < patientData.images.length; i++) {
                    const img = patientData.images[i];
                    const imgId = `${id}-${i}`;

                    await prisma.patientImage.upsert({
                        where: { id: imgId },
                        update: {
                            url: img.bytescale_url,
                            fileName: img.filename,
                        },
                        create: {
                            id: imgId,
                            url: img.bytescale_url,
                            fileName: img.filename,
                            patientId: id
                        }
                    });
                }
            }

            successCount++;
            if (successCount % 10 === 0) console.log(`Processed ${successCount}/${entries.length}...`);
        } catch (err) {
            console.error(`Error syncing patient ${patientData.patient_name}:`, err.message);
            errorCount++;
        }
    }

    console.log('\n--- Sync Results ---');
    console.log(`Successfully synced: ${successCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('Done!');

    await prisma.$disconnect();
}

sync();
