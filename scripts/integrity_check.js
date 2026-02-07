/**
 * Integrity Check & Auto-Fix
 * ==========================
 * 
 * Este script realiza verificações de integridade e correções automáticas:
 * 1. Une exames duplicados (Pendente + Concluído no mesmo paciente)
 * 2. Adiciona imagens faltantes a exames laudados
 * 3. Remove exames pendentes órfãos que já foram laudados
 * 
 * Uso:
 *   node scripts/integrity_check.js              # Preview
 *   node scripts/integrity_check.js --execute    # Executa as correções
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const execute = process.argv.includes('--execute');

    console.log('='.repeat(70));
    console.log('🛡️  NEUROAPP - INTEGRITY CHECK & AUTO-FIX');
    console.log('='.repeat(70));

    if (!execute) {
        console.log('⚠️  MODO PREVIEW - use --execute para aplicar mudanças\n');
    }

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
    let imagesMoved = 0;

    for (const patient of patients) {
        // Encontra exames concluídos (com laudo)
        const completedExams = patient.exams.filter(e => e.status === 'completed' && e.report);
        // Encontra exames pendentes
        const pendingExams = patient.exams.filter(e => e.status === 'pending');

        if (completedExams.length > 0 && pendingExams.length > 0) {
            console.log(`\n⚠️  Inconsistência em: ${patient.name}`);

            const targetExam = completedExams[0]; // Consolidar no primeiro concluído

            for (const pending of pendingExams) {
                console.log(`   📦 Analisando ${pending.images.length} imagens de ${pending.id}...`);

                const existingUrls = new Set(targetExam.images.map(img => img.url));
                let movedForThisExam = 0;

                for (const img of pending.images) {
                    if (!existingUrls.has(img.url)) {
                        if (execute) {
                            await prisma.examImage.update({
                                where: { id: img.id },
                                data: { examId: targetExam.id }
                            });
                        }
                        existingUrls.add(img.url);
                        movedForThisExam++;
                        imagesMoved++;
                    } else {
                        // Duplicata exata: remove a da pendente
                        if (execute) {
                            await prisma.examImage.delete({ where: { id: img.id } });
                        }
                    }
                }

                console.log(`   ✨ ${movedForThisExam} novas imagens identificadas para o Laudo.`);
                console.log(`   🗑️  Removendo exame pendente duplicado ${pending.id}...`);

                if (execute) {
                    await prisma.exam.delete({ where: { id: pending.id } });
                }
                fixedCount++;
            }
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ VERIFICAÇÃO CONCLUÍDA');
    console.log('='.repeat(70));
    console.log(`   Inconsistências corrigidas: ${fixedCount}`);
    console.log(`   Imagens migradas/consolidadas: ${imagesMoved}`);
    console.log('='.repeat(70) + '\n');

    await prisma.$disconnect();
}

main().catch(console.error);
