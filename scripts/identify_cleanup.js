const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: { report: true }
            }
        }
    });

    console.log('--- ANÁLISE DE PACIENTES PARA LIMPEZA ---');
    console.log(`Total no banco: ${patients.length}`);

    const targets = [];
    const withReports = [];

    for (const p of patients) {
        // Um paciente é alvo de limpeza se:
        // 1. Não tem nenhum exame (vazio)
        // 2. Não tem nenhum exame com eyerCloudId (foi criado manualmente e nunca sincronizado)
        const hasEyerId = p.exams.some(e => e.eyerCloudId);
        const hasReport = p.exams.some(e => e.report !== null);

        if (!hasEyerId) {
            if (hasReport) {
                withReports.push(p);
            } else {
                targets.push(p);
            }
        }
    }

    console.log(`\n❌ ALVOS DE LIMPEZA (Sem ID EyerCloud e Sem Laudo): ${targets.length}`);
    targets.forEach(p => {
        console.log(`- ${p.name.padEnd(30)} | ID: ${p.id} | Exames: ${p.exams.length}`);
    });

    console.log(`\n⚠️  ATENÇÃO (Sem ID EyerCloud mas COM LAUDO): ${withReports.length}`);
    withReports.forEach(p => {
        console.log(`- ${p.name.padEnd(30)} | ID: ${p.id} | Exames: ${p.exams.length}`);
    });

    console.log(`\nResumo:\n- Total: ${patients.length}\n- Para deletar: ${targets.length}\n- Manter (com laudo): ${withReports.length}\n- Válidos (EyerCloud): ${patients.length - targets.length - withReports.length}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
