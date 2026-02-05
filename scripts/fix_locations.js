/**
 * Script para corrigir locais baseados nas datas de exame
 * 
 * Regras:
 * - Até 15/01/2026 = Tauá-CE
 * - 27-30/01/2026 = Jaci-SP  
 * - 02-05/02/2026 = Campos do Jordão
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixLocations() {
    console.log('🗺️ Corrigindo locais baseados nas datas de exame...\n');

    // Verifica contagem atual
    const examCount = await prisma.$queryRaw`SELECT count(*) as c FROM "Exam"`;
    const imageCount = await prisma.$queryRaw`SELECT count(*) as c FROM "ExamImage"`;
    const reportCount = await prisma.$queryRaw`SELECT count(*) as c FROM "MedicalReport" WHERE "examId" IS NOT NULL`;

    console.log('📊 Estado atual do banco:');
    console.log(`   Exams: ${examCount[0].c}`);
    console.log(`   ExamImages: ${imageCount[0].c}`);
    console.log(`   Reports com examId: ${reportCount[0].c}`);

    // Busca distribuição por data
    const dateDistribution = await prisma.$queryRaw`
        SELECT 
            DATE("examDate") as data,
            count(*) as total
        FROM "Exam" 
        GROUP BY DATE("examDate") 
        ORDER BY DATE("examDate")
    `;

    console.log('\n📅 Distribuição por data:');
    for (const row of dateDistribution) {
        console.log(`   ${row.data}: ${row.total} exames`);
    }

    // Aplica correções de local
    console.log('\n🔄 Aplicando correções de local...\n');

    // Até 15/01/2026 = Tauá-CE
    const taua = await prisma.$executeRaw`
        UPDATE "Exam" 
        SET "location" = 'Tauá-CE' 
        WHERE "examDate" <= '2026-01-15'::date
    `;
    console.log(`   ✅ Tauá-CE: ${taua} exames atualizados`);

    // 27-30/01/2026 = Jaci-SP
    const jaci = await prisma.$executeRaw`
        UPDATE "Exam" 
        SET "location" = 'Jaci-SP' 
        WHERE "examDate" >= '2026-01-27'::date AND "examDate" <= '2026-01-30'::date
    `;
    console.log(`   ✅ Jaci-SP: ${jaci} exames atualizados`);

    // 02-05/02/2026 = Campos do Jordão
    const campos = await prisma.$executeRaw`
        UPDATE "Exam" 
        SET "location" = 'Campos do Jordão' 
        WHERE "examDate" >= '2026-02-02'::date AND "examDate" <= '2026-02-05'::date
    `;
    console.log(`   ✅ Campos do Jordão: ${campos} exames atualizados`);

    // Atualiza também a tabela Patient antiga (para compatibilidade)
    console.log('\n🔄 Atualizando tabela Patient (compatibilidade)...\n');

    const tauaP = await prisma.$executeRaw`
        UPDATE "Patient" 
        SET "location" = 'Tauá-CE' 
        WHERE "examDate" <= '2026-01-15'::date
    `;
    console.log(`   ✅ Tauá-CE: ${tauaP} pacientes atualizados`);

    const jaciP = await prisma.$executeRaw`
        UPDATE "Patient" 
        SET "location" = 'Jaci-SP' 
        WHERE "examDate" >= '2026-01-27'::date AND "examDate" <= '2026-01-30'::date
    `;
    console.log(`   ✅ Jaci-SP: ${jaciP} pacientes atualizados`);

    const camposP = await prisma.$executeRaw`
        UPDATE "Patient" 
        SET "location" = 'Campos do Jordão' 
        WHERE "examDate" >= '2026-02-02'::date AND "examDate" <= '2026-02-05'::date
    `;
    console.log(`   ✅ Campos do Jordão: ${camposP} pacientes atualizados`);

    // Verifica resultado
    const locationDistribution = await prisma.$queryRaw`
        SELECT "location", count(*) as total
        FROM "Exam" 
        GROUP BY "location" 
        ORDER BY total DESC
    `;

    console.log('\n📍 Distribuição por local (após correção):');
    for (const row of locationDistribution) {
        console.log(`   ${row.location}: ${row.total} exames`);
    }

    console.log('\n✅ Correção de locais concluída!');
    await prisma.$disconnect();
}

fixLocations().catch(console.error);
