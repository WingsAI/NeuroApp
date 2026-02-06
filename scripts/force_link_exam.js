const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
    const name = "APARECIDO PIVARO";
    console.log(`🚀 Criando exames para: ${name}`);

    const patient = await prisma.patient.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } }
    });

    if (!patient) {
        console.log("❌ Paciente não encontrado!");
        return;
    }

    const m = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/bytescale_mapping_cleaned.json'));
    const entry = Object.entries(m).find(([k, v]) => v.patient_name && v.patient_name.includes(name));

    if (entry) {
        const [folderKey, data] = entry;
        const examId = data.exam_id || folderKey.split('_').pop();

        console.log(`📂 Criando exame ${examId}...`);

        let exam = await prisma.exam.findFirst({
            where: { eyerCloudId: examId }
        });

        if (!exam) {
            exam = await prisma.exam.create({
                data: {
                    eyerCloudId: examId,
                    examDate: new Date(data.exam_date),
                    location: "Jaci",
                    status: 'pending',
                    patientId: patient.id
                }
            });
        } else {
            exam = await prisma.exam.update({
                where: { id: exam.id },
                data: {
                    patientId: patient.id,
                    location: "Jaci",
                    examDate: new Date(data.exam_date)
                }
            });
        }

        console.log(`🖼️ Vinculando ${data.images.length} imagens...`);
        for (const img of data.images) {
            const existingImg = await prisma.examImage.findFirst({
                where: { url: img.bytescale_url }
            });

            if (!existingImg) {
                await prisma.examImage.create({
                    data: {
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
        }
        console.log("✅ Exame e imagens vinculados!");
    }

    await prisma.$disconnect();
}

main().catch(console.error);
