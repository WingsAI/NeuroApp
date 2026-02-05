const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixLocations() {
    console.log('🚀 Iniciando correção de localizações por data...\n');

    const exams = await prisma.exam.findMany();
    let updatedCount = 0;

    for (const exam of exams) {
        const date = exam.examDate;
        let newLocation = null;

        // Regras de data
        if (date <= new Date('2026-01-16T00:00:00Z')) {
            newLocation = 'Tauá-CE';
        } else if (date >= new Date('2026-01-27T00:00:00Z') && date <= new Date('2026-01-31T23:59:59Z')) {
            newLocation = 'Jaci-SP';
        } else if (date >= new Date('2026-02-02T00:00:00Z') && date <= new Date('2026-02-06T23:59:59Z')) {
            newLocation = 'Campos do Jordão';
        }

        // Só atualiza se for diferente ou se for o nome genérico da Phelcom
        if (newLocation && (exam.location === 'Phelcom EyeR Cloud' || exam.location === 'Não informado' || !exam.location)) {
            await prisma.exam.update({
                where: { id: exam.id },
                data: { location: newLocation }
            });
            updatedCount++;
        }
    }

    console.log(`✅ Atualização concluída!`);
    console.log(`📊 Exames atualizados: ${updatedCount}`);
}

fixLocations()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
