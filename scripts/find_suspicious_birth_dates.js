const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findSuspiciousBirthDates() {
  console.log('=== Find Suspicious Birth Dates ===\n');

  try {
    const patients = await prisma.patient.findMany({
      orderBy: { name: 'asc' }
    });

    const suspicious = [];

    for (const patient of patients) {
      if (!patient.birthDate) continue;

      const birthYear = patient.birthDate.getFullYear();
      const age = new Date().getFullYear() - birthYear;

      // Check for suspicious patterns:
      // 1. Age < 18 or > 110 (unlikely for ophthalmology screening)
      // 2. Birth year exactly 1965, 1970, 1975, 1980 (common placeholder dates)
      // 3. Birth date is 01/01 (common placeholder)

      const isTooYoung = age < 18;
      const isTooOld = age > 110;
      const isPlaceholderYear = [1960, 1965, 1970, 1975, 1980, 1985, 1990].includes(birthYear);
      const isJan1 = patient.birthDate.getMonth() === 0 && patient.birthDate.getDate() === 1;

      if (isTooYoung || isTooOld || (isPlaceholderYear && isJan1)) {
        suspicious.push({
          name: patient.name,
          id: patient.id,
          birthDate: patient.birthDate.toISOString().split('T')[0],
          age,
          reason: isTooYoung ? 'Too young (< 18)' :
                  isTooOld ? 'Too old (> 110)' :
                  'Placeholder date (round year + Jan 1)'
        });
      }
    }

    console.log(`Found ${suspicious.length} patients with suspicious birth dates:\n`);

    suspicious.forEach((p, idx) => {
      if (idx < 30) { // Show first 30
        console.log(`${idx + 1}. ${p.name}`);
        console.log(`   Birth date: ${p.birthDate} (age ${p.age})`);
        console.log(`   Reason: ${p.reason}`);
        console.log(`   ID: ${p.id}\n`);
      }
    });

    if (suspicious.length > 30) {
      console.log(`... and ${suspicious.length - 30} more\n`);
    }

    console.log('=== Summary ===');
    console.log(`Total suspicious dates: ${suspicious.length}`);
    console.log('\nRecommendation: Verify these dates in EyerCloud UI');

  } finally {
    await prisma.$disconnect();
  }
}

findSuspiciousBirthDates().catch(console.error);
