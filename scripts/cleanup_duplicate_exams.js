const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDuplicateExams() {
    console.log("🚀 Iniciando limpeza de exames duplicados (Pendente + Concluído no mesmo paciente)...");

    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: true,
                    report: true
                }
            }
        }
    });

    let fixedCount = 0;

    for (const patient of patients) {
        const completedExams = patient.exams.filter(e => e.status === 'completed' && e.report);
        const pendingExams = patient.exams.filter(e => e.status === 'pending');

        if (completedExams.length > 0 && pendingExams.length > 0) {
            console.log(`\n⚠️  Paciente Duplicado: ${patient.name}`);

            const targetExam = completedExams[0]; // Consolida no primeiro concluído

            for (const pending of pendingExams) {
                console.log(`   📦 Movendo ${pending.images.length} imagens de ${pending.id} para ${targetExam.id}...`);

                const existingUrls = new Set(targetExam.images.map(img => img.url));

                for (const img of pending.images) {
                    if (!existingUrls.has(img.url)) {
                        await prisma.examImage.update({
                            where: { id: img.id },
                            data: { examId: targetExam.id }
                        });
                        existingUrls.add(img.url);
                    } else {
                        await prisma.examImage.delete({ where: { id: img.id } });
                    }
                }

                console.log(`   🗑️ Deletando exame pendente ${pending.id}...`);
                await prisma.exam.delete({ where: { id: pending.id } });
                fixedCount++;
            }
        }
    }

    console.log(`\n🎉 Finalizado! ${fixedCount} exames duplicados removidos.`);
}

fixDuplicateExams()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
