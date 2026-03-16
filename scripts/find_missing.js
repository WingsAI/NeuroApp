const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

function normalizeName(name) {
  return (name || '').toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
}

async function check() {
  const state = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/download_state.json', 'utf8'));
  const stateIds = Object.keys(state.exam_details || {});

  // DB exams
  const dbExams = await prisma.exam.findMany({ select: { id: true, eyerCloudId: true, patientId: true, patient: { select: { name: true } } } });
  const dbEyerIds = new Set();
  for (const e of dbExams) {
    dbEyerIds.add(e.id);
    if (e.eyerCloudId) dbEyerIds.add(e.eyerCloudId);
  }

  const missingExams = stateIds.filter(id => !dbEyerIds.has(id));
  console.log('DB exams:', dbExams.length);
  console.log('EyerCloud exams (download_state):', stateIds.length);
  console.log('Missing exams from DB:', missingExams.length);
  missingExams.forEach(id => {
    const d = state.exam_details[id];
    const imgCount = (d.image_details || d.image_list || []).length;
    console.log(`  ${d.patient_name} | ${id} | ${imgCount} images | date: ${(d.exam_date||'').substring(0,10)}`);
  });

  // DB patients
  const dbPats = await prisma.patient.findMany({ select: { id: true, name: true } });
  const dbNorms = new Set(dbPats.map(p => normalizeName(p.name)));

  // EyerCloud unique patients
  const statePatients = {};
  for (const [eid, d] of Object.entries(state.exam_details)) {
    const norm = normalizeName(d.patient_name);
    if (!statePatients[norm]) statePatients[norm] = [];
    statePatients[norm].push(eid);
  }

  const missingPats = Object.keys(statePatients).filter(n => !dbNorms.has(n));
  console.log('\nDB patients:', dbPats.length);
  console.log('EyerCloud unique patients:', Object.keys(statePatients).length);
  console.log('Missing patients:', missingPats.length);
  missingPats.forEach(n => {
    const eids = statePatients[n];
    console.log(`  ${n} (${eids.length} exams: ${eids.join(', ')})`);
  });

  await prisma.$disconnect();
}
check();
