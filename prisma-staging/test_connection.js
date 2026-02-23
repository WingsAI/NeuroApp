#!/usr/bin/env node
// Test staging DB connection and seed the 2 source logins

require('dotenv').config({ path: __dirname + '/.env' });
const { PrismaClient } = require('.prisma/client-staging');

const prisma = new PrismaClient({
  datasources: {
    db: { url: process.env.STAGING_DATABASE_URL },
  },
});

async function main() {
  console.log('🔌 Testing staging DB connection...\n');

  // Test connection
  const result = await prisma.$queryRaw`SELECT 1 as ok`;
  console.log('✅ Connection OK:', result);

  // Seed the 2 source logins
  const mozania = await prisma.sourceLogin.upsert({
    where: { email: 'mozaniareis@usp.br' },
    update: {},
    create: {
      email: 'mozaniareis@usp.br',
      clinicName: 'Pós-Doutorado',
      userName: 'Mozania Reis de Matos',
      totalExams: 1998,
      totalPatients: 1961,
    },
  });
  console.log('✅ SourceLogin Mozania:', mozania.id);

  const melina = await prisma.sourceLogin.upsert({
    where: { email: 'dramelinalannes.endocrino@gmail.com' },
    update: {},
    create: {
      email: 'dramelinalannes.endocrino@gmail.com',
      clinicName: 'Campos do Jordão',
      userName: 'Melina Morais Lannes',
      totalExams: 556,
      totalPatients: 537,
    },
  });
  console.log('✅ SourceLogin Melina:', melina.id);

  // Count tables
  const counts = {
    sourceLogins: await prisma.sourceLogin.count(),
    patients: await prisma.stagingPatient.count(),
    exams: await prisma.stagingExam.count(),
    images: await prisma.stagingExamImage.count(),
    logs: await prisma.normalizationLog.count(),
  };
  console.log('\n📊 Table counts:', counts);

  console.log('\n🎉 Staging DB ready!');
}

main()
  .catch(e => { console.error('❌ Error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
