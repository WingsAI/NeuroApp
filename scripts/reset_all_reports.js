const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetAllLaudos() {
    console.log('🚀 Iniciando reset total de laudos e encaminhamentos...');

    try {
        // 1. Deletar todos os encaminhamentos
        const referrals = await prisma.patientReferral.deleteMany({});
        console.log(`✅ ${referrals.count} encaminhamentos deletados.`);

        // 2. Deletar todos os laudos médicos
        const reports = await prisma.medicalReport.deleteMany({});
        console.log(`✅ ${reports.count} laudos médicos deletados.`);

        // 3. Resetar o status de todos os pacientes para 'pending'
        const patients = await prisma.patient.updateMany({
            data: {
                status: 'pending'
            }
        });
        console.log(`✅ ${patients.count} pacientes resetados para o status 'pending' (Fila de Laudos).`);

        console.log('\n✨ Reset concluído com sucesso. Todos os pacientes voltaram para a Fila de Laudos como novos.');
    } catch (error) {
        console.error('❌ Erro durante o reset:', error);
    } finally {
        await prisma.$disconnect();
    }
}

resetAllLaudos();
