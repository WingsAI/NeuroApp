const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeName(name) {
  return (name || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

async function check() {
  const exams = require('./eyercloud_downloader/new_exams_312.json');
  const dbPats = await prisma.patient.findMany({ select: { id: true, name: true } });
  const dbPatByNorm = {};
  for (const p of dbPats) dbPatByNorm[normalizeName(p.name)] = p;
  const dbPatIds = new Set(dbPats.map(p => p.id));

  // Group exams by patient name
  const byPatient = {};
  for (const [eid, exam] of Object.entries(exams)) {
    const norm = normalizeName(exam.patient_name);
    if (!byPatient[norm]) byPatient[norm] = [];
    byPatient[norm].push({ eid, exam });
  }

  // For new patients only, check first exam ID collisions
  let collisions = 0;
  for (const [norm, items] of Object.entries(byPatient)) {
    if (dbPatByNorm[norm]) continue; // existing patient
    items.sort((a, b) => (a.exam.exam_date || '').localeCompare(b.exam.exam_date || ''));
    const patientId = items[0].eid;
    if (dbPatIds.has(patientId)) {
      const existing = dbPats.find(p => p.id === patientId);
      console.log('COLLISION:', norm, '-> wants ID', patientId, '-> existing:', existing.name);
      collisions++;
    }
  }
  console.log('\nTotal ID collisions:', collisions);

  // Also check: are there patients in DB whose name matches but normalize doesn't work?
  // Check a specific case
  const testName = 'LUIZ CARLOS SANCHES GARCIA';
  const normTest = normalizeName(testName);
  console.log('\nLooking for:', normTest);
  console.log('In DB lookup:', dbPatByNorm[normTest] ? 'FOUND' : 'NOT FOUND');

  // Search all DB patients for similar
  for (const p of dbPats) {
    if (p.name.includes('LUIZ CARLOS')) {
      console.log('  DB has:', JSON.stringify(p.name), '-> normalized:', JSON.stringify(normalizeName(p.name)));
    }
  }

  await prisma.$disconnect();
}
check();
