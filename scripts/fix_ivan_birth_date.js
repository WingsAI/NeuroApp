const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PREVIEW = !process.argv.includes('--execute');

async function fixIvanBirthDate() {
  console.log('=== Fix Ivan Lucio Birth Date ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  try {
    const ivan = await prisma.patient.findFirst({
      where: {
        name: { contains: 'IVAN LÚCIO DE LIMA', mode: 'insensitive' }
      }
    });

    if (!ivan) {
      console.log('Ivan Lucio de Lima not found in DB');
      return;
    }

    console.log('Patient:', ivan.name);
    console.log('  Current birth date:', ivan.birthDate?.toISOString().split('T')[0] || 'NULL');
    console.log('  Correct birth date (from EyerCloud): 1980-06-26');

    if (!PREVIEW) {
      await prisma.patient.update({
        where: { id: ivan.id },
        data: { birthDate: new Date('1980-06-26') }
      });
      console.log('  ✓ Updated to 1980-06-26');
    } else {
      console.log('  Would update to 1980-06-26');
    }

  } finally {
    await prisma.$disconnect();
  }
}

fixIvanBirthDate().catch(console.error);
