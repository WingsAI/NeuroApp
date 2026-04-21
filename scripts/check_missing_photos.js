const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const { PrismaClient: StagingClient } = require('.prisma/client-staging');
const stagingPrisma = new StagingClient();

const names = [
  'CARMEN MARIA SOUZA LIMA',
  'DULCE NIEHUES DA SILVA',
  'JAIR VITORINO PEREIRA',
  'JOELIA DOS SANTOS DA CONCEICAO',
  'JOSE TADEU DA SILVA',
  'MARCIA CRISTINA GARUFFI RAMOS',
  'MARIA JOSE MARINHO PEREIRA',
  'NEUSA RODRIGUES DA SILVA',
  'RITA CASSIA LUNA DA SILVA',
  'SIDNEIA BORGES OLIVEIRA DA COSTA',
  'VALDOMIRO FERREIRA PESSOA',
];

function normalize(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

(async () => {
  console.log('=== MAIN DB ===');
  for (const name of names) {
    const patients = await prisma.patient.findMany({
      where: { name: { contains: name.split(' ')[0], mode: 'insensitive' } },
      include: { exams: { include: { images: true, report: true } } },
    });
    const matches = patients.filter(p => normalize(p.name) === normalize(name));
    if (matches.length === 0) {
      console.log(`[NOT IN MAIN] ${name}`);
    } else {
      for (const p of matches) {
        const totalImages = p.exams.reduce((a, e) => a + e.images.length, 0);
        const hasReport = p.exams.some(e => e.report);
        console.log(`[MAIN] ${p.name} | id=${p.id} | exams=${p.exams.length} | images=${totalImages} | hasReport=${hasReport}`);
        for (const e of p.exams) {
          console.log(`   exam id=${e.id} eyerCloudId=${e.eyerCloudId} date=${e.examDate?.toISOString?.()} location=${e.location} images=${e.images.length} status=${e.status}`);
        }
      }
    }
  }

  console.log('\n=== STAGING DB ===');
  for (const name of names) {
    const patients = await stagingPrisma.stagingPatient.findMany({
      where: { fullName: { contains: name.split(' ')[0], mode: 'insensitive' } },
      include: { exams: { include: { images: true } } },
    });
    const matches = patients.filter(p => normalize(p.fullName) === normalize(name));
    if (matches.length === 0) {
      console.log(`[NOT IN STAGING] ${name}`);
    } else {
      for (const p of matches) {
        const totalImages = p.exams.reduce((a, e) => a + e.images.length, 0);
        console.log(`[STAGING] ${p.fullName} | id=${p.id} | eyercloudId=${p.eyercloudPatientId} | exams=${p.exams.length} | images=${totalImages}`);
        for (const e of p.exams) {
          console.log(`   exam id=${e.id} eyercloudId=${e.eyercloudExamId} date=${e.examDate?.toISOString?.()} clinic=${e.clinicName} images=${e.images.length}`);
        }
      }
    }
  }

  await prisma.$disconnect();
  await stagingPrisma.$disconnect();
})();
