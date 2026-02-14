const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const patients = await p.patient.findMany({
    where: { name: { contains: 'APARECIDA DA SILVA', mode: 'insensitive' } },
    select: { id: true, name: true, birthDate: true }
  });
  for (const pat of patients) {
    console.log(`${pat.name} | birthDate: ${pat.birthDate} | raw: ${pat.birthDate?.toISOString()}`);
    if (pat.birthDate) {
      console.log('  epoch ms:', pat.birthDate.getTime());
    }
  }

  // Also check all patients with epoch-0 dates (1969-12-31 or 1970-01-01)
  const all = await p.patient.findMany({ select: { id: true, name: true, birthDate: true } });
  const epoch = all.filter(p => {
    if (!p.birthDate) return false;
    const year = p.birthDate.getFullYear();
    return year === 1969 || year === 1970;
  });
  console.log(`\nAll patients with 1969/1970 birthDate: ${epoch.length}`);
  for (const pat of epoch) {
    console.log(`  ${pat.name} | ${pat.birthDate.toISOString()} | epoch ms: ${pat.birthDate.getTime()}`);
  }

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
