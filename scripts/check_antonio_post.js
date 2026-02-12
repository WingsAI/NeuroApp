const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const exam = await prisma.exam.findUnique({
    where: { id: '697d03f68bc8fc9984f742ca' },
    include: { images: { orderBy: { id: 'asc' } }, patient: true, report: true }
  });

  console.log('Patient:', exam.patient.name);
  console.log('Exam:', exam.id);
  console.log('Has Report:', !!exam.report);
  console.log('Images:', exam.images.length);
  exam.images.forEach((img, i) => {
    const m = img.url.match(/\/patients\/([^/]+)\//);
    const folder = m ? decodeURIComponent(m[1]) : '???';
    console.log(`  ${i + 1}. ${img.id} | ${img.type} | folder: ${folder}`);
  });

  // Also check Robson Tridico
  const robson = await prisma.exam.findUnique({
    where: { id: '697d03f61fa8062e17d3774c' },
    include: { images: { orderBy: { id: 'asc' } }, patient: true }
  });

  console.log('\n--- ROBSON TRIDICO ---');
  console.log('Images:', robson.images.length);
  robson.images.forEach((img, i) => {
    const m = img.url.match(/\/patients\/([^/]+)\//);
    const folder = m ? decodeURIComponent(m[1]) : '???';
    console.log(`  ${i + 1}. ${img.id} | ${img.type} | folder: ${folder}`);
  });

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
