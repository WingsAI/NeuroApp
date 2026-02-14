/**
 * check_selected_images_problems.js - Find all selectedImages issues
 *
 * Checks for:
 * 1. selectedImages pointing to ANTERIOR images (should be COLOR)
 * 2. selectedImages with null/missing OD or OE
 * 3. selectedImages referencing non-existent image IDs
 */

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const reports = await p.medicalReport.findMany({
    where: { selectedImages: { not: null } },
    include: {
      exam: {
        include: {
          images: true,
          patient: { select: { name: true } }
        }
      }
    }
  });

  const problems = [];
  for (const r of reports) {
    const si = r.selectedImages;
    if (!si || typeof si !== 'object') continue;
    const imageMap = {};
    for (const img of r.exam.images) imageMap[img.id] = img.type;

    for (const eye of ['od', 'oe']) {
      const imgId = si[eye];
      if (imgId === null || imgId === undefined || imgId === '') {
        problems.push({
          name: r.exam.patient.name,
          eye: eye.toUpperCase(),
          imgId: null,
          type: 'NULL',
          colorCount: r.exam.images.filter(i => i.type === 'COLOR').length,
          anteriorCount: r.exam.images.filter(i => i.type === 'ANTERIOR').length,
        });
        continue;
      }
      const type = imageMap[imgId];
      if (type === 'ANTERIOR') {
        problems.push({
          name: r.exam.patient.name,
          eye: eye.toUpperCase(),
          imgId,
          type: 'ANTERIOR',
          colorCount: r.exam.images.filter(i => i.type === 'COLOR').length,
          anteriorCount: r.exam.images.filter(i => i.type === 'ANTERIOR').length,
        });
      } else if (!type) {
        problems.push({
          name: r.exam.patient.name,
          eye: eye.toUpperCase(),
          imgId,
          type: 'NOT_FOUND',
          colorCount: r.exam.images.filter(i => i.type === 'COLOR').length,
          anteriorCount: r.exam.images.filter(i => i.type === 'ANTERIOR').length,
        });
      }
    }
  }

  problems.sort((a, b) => a.name.localeCompare(b.name));

  const anterior = problems.filter(p => p.type === 'ANTERIOR');
  const nulls = problems.filter(p => p.type === 'NULL');
  const notFound = problems.filter(p => p.type === 'NOT_FOUND');

  console.log('=== PROBLEMAS ENCONTRADOS ===\n');

  console.log('--- selectedImages apontando para ANTERIOR (deveria ser COLOR) ---');
  for (const p of anterior) {
    console.log(`  ${p.name} - ${p.eye}: ${p.imgId} (ANTERIOR) [${p.colorCount} COLOR, ${p.anteriorCount} ANTERIOR]`);
  }
  console.log(`Total: ${anterior.length}\n`);

  console.log('--- selectedImages NULL (medico precisa re-selecionar) ---');
  for (const p of nulls) {
    console.log(`  ${p.name} - ${p.eye}: null [${p.colorCount} COLOR, ${p.anteriorCount} ANTERIOR]`);
  }
  console.log(`Total: ${nulls.length}\n`);

  if (notFound.length > 0) {
    console.log('--- selectedImages ID nao encontrado nas imagens ---');
    for (const p of notFound) {
      console.log(`  ${p.name} - ${p.eye}: ${p.imgId}`);
    }
    console.log(`Total: ${notFound.length}\n`);
  }

  console.log('=== RESUMO ===');
  console.log(`ANTERIOR no selectedImages: ${anterior.length}`);
  console.log(`NULL no selectedImages: ${nulls.length}`);
  console.log(`ID nao encontrado: ${notFound.length}`);
  console.log(`Total problemas: ${problems.length}`);

  // Unique patients affected
  const uniquePatients = new Set(problems.map(p => p.name));
  console.log(`Pacientes afetados: ${uniquePatients.size}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
