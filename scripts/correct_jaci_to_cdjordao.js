const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function correctLocations() {
  console.log('=== Corrigindo Jaci-SP para Campos do Jordão-SP ===\n');

  // Find all exams currently marked as Jaci-SP
  const jaciExams = await prisma.exam.findMany({
    where: { location: 'Jaci-SP' },
    select: {
      id: true,
      eyerCloudId: true,
      examDate: true,
      patient: { select: { name: true } }
    },
    orderBy: { examDate: 'asc' }
  });

  console.log(`Total exames em Jaci-SP: ${jaciExams.length}\n`);

  // Show date range
  if (jaciExams.length > 0) {
    const dates = jaciExams.map(e => e.examDate).filter(Boolean);
    console.log('Data mais antiga:', dates[0]?.toISOString().split('T')[0]);
    console.log('Data mais recente:', dates[dates.length - 1]?.toISOString().split('T')[0]);
    console.log();
  }

  // Exams from Feb 3-4 (2026-02-03 to 2026-02-05) should be Campos do Jordão
  const toCorrect = jaciExams.filter(e => {
    if (!e.examDate) return false;
    const dateStr = e.examDate.toISOString().split('T')[0];
    return dateStr >= '2026-02-03' && dateStr <= '2026-02-05';
  });

  console.log(`Exames de 03-05/02 que devem ser Campos do Jordão: ${toCorrect.length}\n`);

  if (toCorrect.length > 0) {
    console.log('Corrigindo...\n');
    for (const exam of toCorrect) {
      await prisma.exam.update({
        where: { id: exam.id },
        data: { location: 'Campos do Jordão-SP' }
      });
      console.log(`✓ ${exam.patient.name} - ${exam.examDate.toISOString().split('T')[0]}`);
    }
  }

  // Show final distribution
  const counts = await prisma.exam.groupBy({
    by: ['location'],
    _count: true
  });

  console.log('\n=== Distribuição Final ===');
  counts.forEach(c => console.log(`  ${c.location}: ${c._count} exames`));

  await prisma.$disconnect();
}

correctLocations().catch(console.error);
