// Script para adicionar novas unidades de saúde ao banco de dados
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Unidades a serem adicionadas (baseado nos dados do EyerCloud)
const units = [
    {
        name: 'Tauá - CE',
        address: 'Tauá, Ceará',
        email: 'ubs.taua@saude.ce.gov.br',
        phone: '(88) 9999-9999',
        responsible: 'Secretaria de Saúde',
    },
    {
        name: 'Phelcom EyeR Cloud',
        address: 'Plataforma Digital',
        email: 'suporte@phelcom.com',
        phone: '-',
        responsible: 'Phelcom Technologies',
    },
    {
        name: 'Guairá - SP',
        address: 'Guairá, São Paulo',
        email: 'saude@guaira.sp.gov.br',
        phone: '(17) 9999-9999',
        responsible: 'Secretaria de Saúde',
    },
    {
        name: 'Martinópolis - SP',
        address: 'Martinópolis, São Paulo',
        email: 'saude@martinopolis.sp.gov.br',
        phone: '(18) 9999-9999',
        responsible: 'Secretaria de Saúde',
    },
];

async function main() {
    console.log('📋 Adicionando unidades de saúde ao banco de dados...\n');

    for (const unit of units) {
        // Verifica se a unidade já existe
        const existing = await prisma.healthUnit.findFirst({
            where: {
                OR: [
                    { name: unit.name },
                    { name: { contains: unit.name.split(' - ')[0] } }
                ]
            }
        });

        if (existing) {
            console.log(`⏭️ Unidade já existe: ${unit.name}`);
            continue;
        }

        try {
            await prisma.healthUnit.create({
                data: unit,
            });
            console.log(`✅ Criada: ${unit.name}`);
        } catch (error) {
            console.error(`❌ Erro ao criar ${unit.name}:`, error.message);
        }
    }

    console.log('\n--- Listando todas as unidades ---');
    const allUnits = await prisma.healthUnit.findMany({
        orderBy: { name: 'asc' }
    });

    for (const u of allUnits) {
        console.log(`   • ${u.name}`);
    }

    console.log(`\n✅ Total de unidades: ${allUnits.length}`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
