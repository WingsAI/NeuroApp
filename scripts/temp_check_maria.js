const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const exams = await prisma.exam.findMany({
    select: { id: true, eyerCloudId: true }
  });

  const short = exams.filter(e => e.eyerCloudId && e.eyerCloudId.length < 24);
  const long = exams.filter(e => e.eyerCloudId && e.eyerCloudId.length === 24);
  const noEyer = exams.filter(e => !e.eyerCloudId);
  const cml = exams.filter(e => e.id.startsWith('cml'));

  console.log('eyerCloudId stats:');
  console.log('  24 chars:', long.length);
  console.log('  <24 chars:', short.length);
  console.log('  null:', noEyer.length);
  console.log('  cml exams:', cml.length);

  if (short.length > 0) {
    const lens = {};
    short.forEach(e => {
      const l = e.eyerCloudId.length;
      lens[l] = (lens[l] || 0) + 1;
    });
    console.log('  Short lengths:', JSON.stringify(lens));
    console.log('  Samples:', short.slice(0, 5).map(e => `${e.id.substring(0,16)}->eyer:${e.eyerCloudId}`).join('\n    '));
  }

  // For cml exams, what are their eyerCloudId values?
  const cmlWithEyer = cml.filter(e => e.eyerCloudId);
  console.log('\nCML exams with eyerCloudId:', cmlWithEyer.length);
  console.log('  Samples:', cmlWithEyer.slice(0, 5).map(e => `${e.id} -> ${e.eyerCloudId}`).join('\n    '));

  // Non-cml exams where id !== eyerCloudId
  const nonCml = exams.filter(e => !e.id.startsWith('cml'));
  const mismatch = nonCml.filter(e => e.eyerCloudId && e.id !== e.eyerCloudId);
  console.log('\nNon-CML exams where id !== eyerCloudId:', mismatch.length);
  if (mismatch.length > 0) {
    console.log('  Samples:', mismatch.slice(0, 5).map(e => `id:${e.id.substring(0,16)} eyer:${e.eyerCloudId.substring(0,16)}`).join('\n    '));
  }

  await prisma.$disconnect();
}

check();
