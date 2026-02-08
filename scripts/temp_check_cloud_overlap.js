const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const mapping = JSON.parse(fs.readFileSync('E:/GitHub/NeuroApp/bytescale_mapping.json', 'utf8'));

async function main() {
  const exams = await db.exam.findMany({ select: { id: true, eyerCloudId: true } });
  const examIds = new Set([
    ...exams.map(e => e.id),
    ...exams.map(e => e.eyerCloudId).filter(Boolean)
  ]);

  const cloudEntries = Object.entries(mapping);
  let notInDb = 0;
  const missing = [];

  for (const [key, data] of cloudEntries) {
    const eid = data.exam_id || key;
    if (!examIds.has(eid)) {
      notInDb++;
      missing.push(`${data.patient_name} ${eid}`);
    }
  }

  console.log('Cloud entries NOT matching any exam in DB:', notInDb);
  if (notInDb > 0) missing.slice(0, 5).forEach(m => console.log(' ', m));

  await db.$disconnect();
}
main();
