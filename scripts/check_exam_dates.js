const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const exams = await prisma.exam.findMany({
        select: {
            id: true,
            examDate: true,
            location: true
        },
        where: {
            location: 'Phelcom EyeR Cloud'
        }
    });

    console.log(`Found ${exams.length} exams with location 'Phelcom EyeR Cloud'`);

    // Group by date to see ranges
    const dateGroups = {};
    exams.forEach(e => {
        const dateStr = e.examDate.toISOString().split('T')[0];
        dateGroups[dateStr] = (dateGroups[dateStr] || 0) + 1;
    });

    console.log('Date distribution:', JSON.stringify(dateGroups, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
