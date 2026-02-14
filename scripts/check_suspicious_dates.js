const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const patients = await p.patient.findMany({
    where: { birthDate: { not: null } },
    select: { id: true, name: true, birthDate: true },
    orderBy: { birthDate: 'asc' }
  });

  console.log(`Total patients with birthDate: ${patients.length}\n`);

  // Show oldest dates (suspicious ones)
  console.log('=== OLDEST BIRTH DATES ===');
  for (const pat of patients.slice(0, 20)) {
    const d = pat.birthDate;
    const formatted = d ? d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'null';
    const iso = d ? d.toISOString() : 'null';
    console.log(`  ${formatted} (${iso}) - ${pat.name}`);
  }

  // Check for any dates in 1969-1970 range
  console.log('\n=== DATES IN 1969-1970 ===');
  const epoch = patients.filter(p => {
    const year = p.birthDate?.getFullYear();
    return year >= 1969 && year <= 1970;
  });
  console.log(`Found: ${epoch.length}`);
  epoch.forEach(pat => {
    console.log(`  ${pat.birthDate?.toISOString()} - ${pat.name}`);
  });

  // Check for any dates that look like epoch 0 in different timezones
  console.log('\n=== DATES THAT COULD BE EPOCH 0 ===');
  const epochSuspect = patients.filter(p => {
    const ts = p.birthDate?.getTime();
    return ts !== undefined && Math.abs(ts) < 86400000; // Within 1 day of epoch 0
  });
  console.log(`Found: ${epochSuspect.length}`);
  epochSuspect.forEach(pat => {
    console.log(`  ${pat.birthDate?.toISOString()} (ts: ${pat.birthDate?.getTime()}) - ${pat.name}`);
  });

  // Show dates before 1930 (very old - might be errors)
  console.log('\n=== DATES BEFORE 1930 (possibly wrong) ===');
  const veryOld = patients.filter(p => p.birthDate?.getFullYear() < 1930);
  console.log(`Found: ${veryOld.length}`);
  veryOld.forEach(pat => {
    console.log(`  ${pat.birthDate?.toLocaleDateString('pt-BR')} - ${pat.name}`);
  });

  await p.$disconnect();
}
main().catch(e => { console.error(e); p.$disconnect(); });
