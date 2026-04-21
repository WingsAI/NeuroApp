const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { PrismaClient: StagingClient } = require('.prisma/client-staging');
const staging = new StagingClient();

function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }

(async () => {
  const id = '699fa6727dd15877d909602a';

  // Check staging by exact ID (not name)
  const stgPatient = await staging.stagingPatient.findUnique({
    where: { id },
    include: { exams: { include: { images: true } }, sourceLogin: true },
  });
  console.log(`Staging patient with id=${id}: ${stgPatient ? 'YES' : 'no'}`);
  if (stgPatient) {
    console.log(`  name="${stgPatient.rawName}"  login=${stgPatient.sourceLogin.email}  isDup=${stgPatient.isDuplicate}  migrated=${stgPatient.migratedToMainDb}`);
    for (const e of stgPatient.exams) {
      console.log(`  stg exam ${e.id} | ${ymd(e.examDate)} | loc="${e.location}" | imgs=${e.images.length}`);
    }
  }

  // Also check staging exam by id
  const stgExam = await staging.stagingExam.findUnique({
    where: { id },
    include: { patient: true, images: true, sourceLogin: true },
  });
  console.log(`\nStaging exam with id=${id}: ${stgExam ? 'YES' : 'no'}`);
  if (stgExam) {
    console.log(`  patient="${stgExam.patient.rawName}"  login=${stgExam.sourceLogin.email}  loc="${stgExam.location}"`);
  }

  // Check what the main main exam originally had — look at git history of download_state.json etc.
  // Just show main state one more time
  const p = await prisma.patient.findUnique({
    where: { id },
    include: { exams: { include: { images: true } } },
  });
  console.log(`\nMain: ${p.name}`);
  for (const e of p.exams) {
    console.log(`  exam ${e.id} | ${ymd(e.examDate)} | loc="${e.location}" | tech="${e.technicianName}" | status=${e.status} | imgs=${e.images.length}`);
    console.log(`    createdAt=${ymd(e.createdAt)}  updatedAt=${ymd(e.updatedAt)}`);
  }

  // Search main for other patients with same eyerCloudId or similar name
  const similarMain = await prisma.patient.findMany({
    where: { name: { contains: 'JAIR', mode: 'insensitive' } },
    include: { exams: true },
  });
  console.log(`\nMain patients with JAIR in name: ${similarMain.length}`);
  similarMain.forEach((x) => {
    x.exams.forEach((e) => console.log(`  ${x.id} | ${x.name} | exam ${e.id} | ${ymd(e.examDate)} | loc="${e.location}"`));
  });

  await prisma.$disconnect();
  await staging.$disconnect();
})();
