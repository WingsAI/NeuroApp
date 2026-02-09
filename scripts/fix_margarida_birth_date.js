const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMargarida() {
  const margarida = await prisma.patient.findFirst({
    where: { name: { contains: 'MARGARIDA INÁCIO SANTOS DO PRADO', mode: 'insensitive' } }
  });

  if (margarida) {
    console.log('Margarida encontrada:');
    console.log('  Data atual:', margarida.birthDate || 'NULL');
    await prisma.patient.update({
      where: { id: margarida.id },
      data: { birthDate: new Date('1955-07-06') }
    });
    console.log('  Data atualizada para: 06/07/1955');
    console.log('  NOTA: Por favor confirme dia e mês corretos no EyerCloud');
  }

  await prisma.$disconnect();
}

fixMargarida().catch(console.error);
