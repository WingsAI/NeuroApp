const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeName(name) {
  return (name || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

async function check() {
  const exams = require('./eyercloud_downloader/new_exams_312.json');
  const dbPatients = await prisma.patient.findMany({ select: { id: true, name: true } });

  const byNorm = {};
  for (const p of dbPatients) {
    byNorm[normalizeName(p.name)] = p;
  }

  let matched = 0, unmatched = 0;
  const unmatchedNames = [];
  const seen = new Set();
  for (const [eid, exam] of Object.entries(exams)) {
    const norm = normalizeName(exam.patient_name);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (byNorm[norm]) {
      matched++;
    } else {
      unmatched++;
      unmatchedNames.push({ norm, original: exam.patient_name, examId: eid });
    }
  }

  console.log('Unique patient names in new data:', seen.size);
  console.log('Matched by normalized name:', matched);
  console.log('Unmatched:', unmatched);
  console.log('\nFirst 20 unmatched:');
  unmatchedNames.slice(0, 20).forEach(n => {
    // Try to find by patient ID from exam data
    const examData = exams[n.examId];
    const dbMatch = dbPatients.find(p => p.id === n.examId);
    console.log(' ', n.norm, dbMatch ? `-> FOUND BY ID: "${dbMatch.name}"` : '(not in DB by ID)');
  });

  // Check if DB has non-uppercase names
  const nonUpper = dbPatients.filter(p => {
    return p.name !== p.name.toUpperCase().trim();
  });
  console.log('\nDB names not uppercase:', nonUpper.length);
  nonUpper.slice(0, 10).forEach(p => console.log(' ', JSON.stringify(p.name), '->', JSON.stringify(normalizeName(p.name))));

  await prisma.$disconnect();
}
check();
