const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function normalize() {
    console.log('🚀 Normalizando nomes de cidades...');

    // Correção de variações de Tauá
    const tauaFix = await prisma.exam.updateMany({
        where: {
            location: {
                in: ['Tauá ', 'Tauá', 'TAUÁ', 'tauá']
            }
        },
        data: {
            location: 'Tauá-CE'
        }
    });
    console.log(`✅ Tauá normalizado: ${tauaFix.count} registros`);

    // Correção de variações de Jaci
    const jaciFix = await prisma.exam.updateMany({
        where: {
            location: {
                in: ['Jaci', 'Jaci-SP ', 'JACI']
            }
        },
        data: {
            location: 'Jaci-SP'
        }
    });
    console.log(`✅ Jaci normalizado: ${jaciFix.count} registros`);

}

normalize()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
