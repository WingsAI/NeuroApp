// Script para adicionar as unidades corretas ao banco de dados (Sem upsert para evitar erro de constraint)
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Unidades reais identificadas no processo de sincronização
const units = [
    {
        name: 'Tauá - CE',
        address: 'Tauá, Ceará',
        email: 'ubs.taua@saude.ce.gov.br',
        phone: '-',
        responsible: 'Secretaria de Saúde de Tauá',
    },
    {
        name: 'Jaci - SP',
        address: 'Jaci, São Paulo',
        email: 'saude.jaci@saude.sp.gov.br',
        phone: '-',
        responsible: 'Secretaria de Saúde de Jaci',
    },
    {
        name: 'Campos do Jordão',
        address: 'Campos do Jordão, São Paulo',
        email: 'saude.cj@saude.sp.gov.br',
        phone: '-',
        responsible: 'Secretaria de Saúde de Campos do Jordão',
    },
    {
        name: 'Phelcom EyeR Cloud',
        address: 'Digital',
        email: '-',
        phone: '-',
        responsible: 'Phelcom Technologies',
    }
];

async function main() {
    console.log('📋 Atualizando unidades de saúde reais...\n');

    for (const unit of units) {
        try {
            // Check if exists by name
            const existing = await prisma.healthUnit.findFirst({
                where: { name: unit.name }
            });

            if (existing) {
                console.log(`⏭️ Já existe: ${unit.name} (Atualizando dados...)`);
                await prisma.healthUnit.update({
                    where: { id: existing.id },
                    data: unit
                });
            } else {
                console.log(`✅ Criando: ${unit.name}`);
                await prisma.healthUnit.create({
                    data: unit
                });
            }
        } catch (error) {
            console.error(`❌ Erro ao sincronizar ${unit.name}:`, error.message);
        }
    }

    // Remover unidades incorretas
    const incorrectUnits = ['Guairá - SP', 'Martinópolis - SP'];
    for (const name of incorrectUnits) {
        try {
            const result = await prisma.healthUnit.deleteMany({
                where: { name: name }
            });
            if (result.count > 0) console.log(`🗑️ Removida unidade incorreta: ${name}`);
        } catch (e) { }
    }

    console.log('\n--- Unidades no Banco ---');
    const allUnits = await prisma.healthUnit.findMany({ orderBy: { name: 'asc' } });
    allUnits.forEach(u => console.log(`   • ${u.name}`));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
