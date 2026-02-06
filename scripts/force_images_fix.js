const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

function generateId() {
    return 'cml' + crypto.randomBytes(10).toString('hex');
}

async function main() {
    console.log("🛠️ FORÇANDO VÍNCULO DE IMAGENS POR NOME DE PASTA");

    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));

    let imageCount = 0;

    for (const [folderKey, data] of Object.entries(mapping)) {
        // Extrai o nome do paciente do nome da pasta (ex: ADEMILSON_ROGERIO_GIRIOLI_69809d89)
        const parts = folderKey.split('_');
        const shortId = parts.pop();
        const folderPatientName = parts.join(' ').replace(/_/g, ' ');

        if (!data.images || data.images.length === 0) continue;

        try {
            // Busca o paciente que tem esse nome (ou similar)
            let patient = await prisma.patient.findFirst({
                where: { name: { equals: folderPatientName, mode: 'insensitive' } }
            });

            if (!patient) continue;

            // Busca o exame deste paciente (agora usamos o ID curto para achar pois muitos ainda estão com ID curto)
            let exam = await prisma.exam.findFirst({
                where: {
                    patientId: patient.id,
                    eyerCloudId: { contains: shortId }
                }
            });

            if (!exam) {
                console.log(`   ⚠️ Exame não encontrado para ${folderPatientName} (${shortId})`);
                continue;
            }

            console.log(`   🖼️ Vinculando ${data.images.length} imagens para ${folderPatientName}...`);

            for (const img of data.images) {
                const existingImg = await prisma.examImage.findFirst({ where: { url: img.bytescale_url } });
                if (!existingImg) {
                    await prisma.examImage.create({
                        data: {
                            id: generateId(),
                            url: img.bytescale_url,
                            fileName: img.filename,
                            type: 'COLOR',
                            examId: exam.id
                        }
                    });
                } else {
                    await prisma.examImage.update({
                        where: { id: existingImg.id },
                        data: { examId: exam.id }
                    });
                }
                imageCount++;
            }
        } catch (err) {
            console.error(`   ❌ Erro em ${folderPatientName}:`, err.message);
        }
    }

    console.log(`\n✅ CONCLUÍDO! ${imageCount} imagens re-vinculadas.`);
    await prisma.$disconnect();
}

main().catch(console.error);
