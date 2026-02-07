const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAntonia() {
    const patientName = 'Antonia Guilherme Da Silva';
    console.log(`🔍 Buscando dados para ${patientName}...`);

    const patient = await prisma.patient.findFirst({
        where: { name: { equals: patientName, mode: 'insensitive' } },
        include: {
            exams: {
                include: {
                    images: true,
                    report: true
                }
            }
        }
    });

    if (!patient) {
        console.error('❌ Paciente não encontrada.');
        return;
    }

    const completedExam = patient.exams.find(e => e.status === 'completed' && e.report);
    const pendingExam = patient.exams.find(e => e.status === 'pending');

    if (completedExam && pendingExam) {
        console.log(`✅ Encontrados dois exames:`);
        console.log(`   - Concluído: ${completedExam.id} (${completedExam.images.length} imagens)`);
        console.log(`   - Pendente: ${pendingExam.id} (${pendingExam.images.length} imagens)`);

        // 1. Mover imagens do pendente para o concluído se não existirem no concluído
        console.log(`📦 Movendo imagens...`);
        let movedCount = 0;
        const existingUrls = new Set(completedExam.images.map(img => img.url));

        for (const img of pendingExam.images) {
            if (!existingUrls.has(img.url)) {
                await prisma.examImage.update({
                    where: { id: img.id },
                    data: { examId: completedExam.id }
                });
                existingUrls.add(img.url);
                movedCount++;
            } else {
                // Se já existe, apenas deleta a duplicata no pendente
                await prisma.examImage.delete({ where: { id: img.id } });
            }
        }
        console.log(`✨ ${movedCount} imagens movidas/consolidadas.`);

        // 2. Deletar o exame pendente agora vazio
        console.log(`🗑️ Deletando exame pendente órfão...`);
        await prisma.exam.delete({ where: { id: pendingExam.id } });
        console.log('✅ Exame pendente deletado.');

        // 3. Verificar se há imagens duplicadas no exame final (limpeza profunda)
        const finalImages = await prisma.examImage.findMany({
            where: { examId: completedExam.id }
        });

        const uniqueFiles = new Map();
        for (const img of finalImages) {
            if (uniqueFiles.has(img.fileName)) {
                console.log(`🗑️ Deletando duplicata de arquivo: ${img.fileName}`);
                await prisma.examImage.delete({ where: { id: img.id } });
            } else {
                uniqueFiles.set(img.fileName, img.id);
            }
        }

    } else {
        console.log('ℹ️ Paciente não está no estado de duplicidade esperado.');
    }

    // Parte adicional: Corrigir URLs quebradas se necessário
    // No caso da Antonia, os URLs pareciam corretos no log anterior (upcdn.io)
    // Se eles estão quebrados no frontend, pode ser por causa do signed URL

    console.log('🚀 Finalizado.');
}

fixAntonia()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
