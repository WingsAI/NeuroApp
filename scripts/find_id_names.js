const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findIdNames() {
  console.log('=== Investigando nomes com IDs ===\n');

  // Find patients with names that look like IDs (24 hex chars)
  const patients = await prisma.patient.findMany({
    orderBy: { name: 'asc' }
  });

  const idLikeNames = patients.filter(p =>
    p.name && /^[0-9a-f]{24}$/i.test(p.name)
  );

  console.log(`Total pacientes com nomes que parecem IDs: ${idLikeNames.length}\n`);

  if (idLikeNames.length > 0) {
    console.log('Pacientes afetados:\n');
    idLikeNames.forEach((p, idx) => {
      console.log(`${idx + 1}. Nome: ${p.name}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   CPF: ${p.cpf || 'N/A'}`);
      console.log(`   Data nasc: ${p.birthDate?.toISOString().split('T')[0] || 'NULL'}`);
      console.log();
    });

    // Check if these match exam IDs in download_state
    const fs = require('fs');
    const path = require('path');
    const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      console.log('\n=== Verificando no download_state.json ===\n');

      for (const p of idLikeNames.slice(0, 5)) {
        const examData = state.exam_details[p.name];
        if (examData) {
          console.log(`ID ${p.name}:`);
          console.log(`  Nome real: ${examData.patient_name || 'N/A'}`);
          console.log(`  Data: ${examData.exam_date || 'N/A'}`);
          console.log();
        }
      }
    }
  }

  await prisma.$disconnect();
}

findIdNames().catch(console.error);
