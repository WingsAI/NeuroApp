const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    where: { cpf: { not: null } },
    select: { name: true, cpf: true }
  });

  let autoCount = 0;
  let conflictCount = 0;
  let numericCount = 0;
  let otherCount = 0;

  for (const p of patients) {
    const cpf = p.cpf || '';
    if (cpf.startsWith('AUTO-')) autoCount++;
    else if (cpf.startsWith('CONFLICT-')) conflictCount++;
    else if (/^\d{11}$/.test(cpf.replace(/\D/g, '')) && cpf.replace(/\D/g, '').length === 11) numericCount++;
    else otherCount++;
  }

  console.log(`Total patients with CPF: ${patients.length}`);
  console.log(`AUTO-xxx format: ${autoCount}`);
  console.log(`CONFLICT-xxx format: ${conflictCount}`);
  console.log(`Numeric (11 digits): ${numericCount}`);
  console.log(`Other: ${otherCount}`);

  // Show sample of numeric ones
  const numeric = patients.filter(p => /^\d{11}$/.test((p.cpf || '').replace(/\D/g, '')));
  console.log('\nSample numeric CPFs:');
  numeric.slice(0, 10).forEach(p => console.log(`  ${p.name}: ${p.cpf}`));

  // Show any non-numeric, non-auto
  const other = patients.filter(p => {
    const cpf = p.cpf || '';
    return !cpf.startsWith('AUTO-') && !cpf.startsWith('CONFLICT-') && !/^\d{11}$/.test(cpf.replace(/\D/g, ''));
  });
  if (other.length > 0) {
    console.log('\nOther format CPFs:');
    other.forEach(p => console.log(`  ${p.name}: "${p.cpf}"`));
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
