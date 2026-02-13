const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');

async function main() {
  const patientDetails = JSON.parse(fs.readFileSync('scripts/eyercloud_downloader/patient_details.json', 'utf-8'));

  console.log('=== VALIDATION ===\n');

  // 1. Check duplicate CPFs
  const patients = await prisma.patient.findMany({ select: { name: true, cpf: true } });
  const cpfCounts = {};
  for (const p of patients) {
    if (!p.cpf) continue;
    const cpf = p.cpf.replace(/\D/g, '');
    if (!cpfCounts[cpf]) cpfCounts[cpf] = [];
    cpfCounts[cpf].push(p.name);
  }
  const dupes = Object.entries(cpfCounts).filter(([, n]) => n.length > 1);
  console.log(`Duplicate CPFs remaining: ${dupes.length}`);
  dupes.forEach(([cpf, names]) => console.log(`  ${cpf}: ${names.join(', ')}`));

  // 2. Check specific patients mentioned by user
  for (const name of [
    'ANA FERREIRA BELIZARIO',
    'APARECIDO TERUEL MARTINS',
    'BASILIA LINO DA SILVA',
    'APARECIDA DA SILVA',
    'YASMIN GABRIELLA DOS SANTOS FREITAS'
  ]) {
    const pat = patients.find(p => p.name.toUpperCase().includes(name));
    if (pat) {
      const full = await prisma.patient.findFirst({
        where: { name: { contains: name, mode: 'insensitive' } },
        include: { exams: { include: { report: { select: { selectedImages: true } } } } }
      });
      console.log(`\n${pat.name}: CPF=${full.cpf || 'null'}, birth=${full.birthDate?.toISOString().slice(0, 10) || 'null'}`);
      for (const e of full.exams) {
        if (e.report) console.log(`  Report selectedImages: ${JSON.stringify(e.report.selectedImages)}`);
      }
    }
  }

  // 3. Count broken selectedImages remaining
  const exams = await prisma.exam.findMany({
    where: { report: { isNot: null } },
    include: {
      images: { orderBy: { id: 'asc' } },
      report: { select: { selectedImages: true } }
    }
  });

  let broken = 0;
  for (const exam of exams) {
    const si = exam.report.selectedImages;
    if (!si || typeof si !== 'object') continue;
    const imageIds = new Set(exam.images.map(i => i.id));
    for (const id of Object.values(si)) {
      if (id && !imageIds.has(id)) { broken++; break; }
    }
  }
  console.log(`\nReports with still-broken selectedImages: ${broken}`);

  // 4. Image count
  const imgCount = await prisma.examImage.count();
  console.log(`Total images: ${imgCount}`);

  // 5. Patients with CPF count
  const withCpf = patients.filter(p => p.cpf && p.cpf.trim()).length;
  console.log(`Patients with CPF: ${withCpf}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
