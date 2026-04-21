const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }

(async () => {
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'eyercloud_downloader/missing_9/meta.json'), 'utf8'));
  console.log(`9 patientes do missing_9 fix:\n`);
  for (const m of meta) {
    const ex = await prisma.exam.findUnique({
      where: { id: m.eyerCloudId },
      include: { patient: true, images: { select: { id: true } } },
    });
    if (!ex) { console.log(`  ? ${m.dbName} (${m.eyerCloudId}) — NOT FOUND IN MAIN DB`); continue; }
    console.log(`  ${m.dbName}`);
    console.log(`    id=${ex.id}`);
    console.log(`    patient="${ex.patient.name}"  birth=${ymd(ex.patient.birthDate)}  cpf=${ex.patient.cpf}`);
    console.log(`    examDate=${ymd(ex.examDate)}  location="${ex.location}"  imgs=${ex.images.length}`);
    console.log('');
  }
  await prisma.$disconnect();
})();
