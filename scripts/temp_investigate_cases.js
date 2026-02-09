const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function investigate() {
  try {
    // Case 1: APARECIDO ROBERTO LOCAISE
    console.log('=== Case 1: APARECIDO ROBERTO LOCAISE ===');
    const aparecido = await prisma.patient.findMany({
      where: { name: { contains: 'APARECIDO ROBERTO LOCAISE', mode: 'insensitive' } },
      include: {
        exams: {
          include: {
            images: true,
            report: true
          }
        }
      }
    });
    console.log('DB patients found:', aparecido.length);
    aparecido.forEach(p => {
      console.log(`Patient: ${p.name}, ID: ${p.id}`);
      p.exams.forEach(e => {
        console.log(`  Exam: ${e.id}, eyerCloudId: ${e.eyerCloudId}, images: ${e.images.length}, date: ${e.examDate}`);
      });
    });

    // Case 2: Djalma Aparecido Lourenço
    console.log('\n=== Case 2: Djalma Aparecido Lourenço ===');
    const djalma = await prisma.patient.findMany({
      where: { name: { contains: 'Djalma', mode: 'insensitive' } },
      include: {
        exams: {
          include: {
            images: true,
            report: true
          },
          orderBy: { examDate: 'asc' }
        }
      }
    });
    console.log('DB patients found:', djalma.length);
    djalma.forEach(p => {
      console.log(`Patient: ${p.name}, ID: ${p.id}`);
      p.exams.forEach(e => {
        console.log(`  Exam: ${e.id}, eyerCloudId: ${e.eyerCloudId}, images: ${e.images.length}, date: ${e.examDate}, time: ${new Date(e.examDate).toLocaleTimeString()}`);
      });
    });

    // Case 3: Ivan Lucio de Lima
    console.log('\n=== Case 3: Ivan Lucio de Lima ===');
    const ivan = await prisma.patient.findMany({
      where: { name: { contains: 'Ivan Lucio', mode: 'insensitive' } },
      include: { exams: true }
    });
    console.log('DB patients found:', ivan.length);
    ivan.forEach(p => {
      console.log(`Patient: ${p.name}, ID: ${p.id}, birthDate: ${p.birthDate}`);
    });

    // Case 4: Helena Maria Souza Dominguez
    console.log('\n=== Case 4: Helena Maria Souza Dominguez ===');
    const helena = await prisma.patient.findMany({
      where: { name: { contains: 'Helena Maria', mode: 'insensitive' } },
      include: {
        exams: {
          include: {
            images: true,
            report: true
          }
        }
      }
    });
    console.log('DB patients found:', helena.length);
    helena.forEach(p => {
      console.log(`Patient: ${p.name}, ID: ${p.id}`);
      p.exams.forEach(e => {
        console.log(`  Exam: ${e.id}, eyerCloudId: ${e.eyerCloudId}, images: ${e.images.length}, date: ${e.examDate}`);
      });
    });

  } finally {
    await prisma.$disconnect();
  }
}

investigate().catch(console.error);
