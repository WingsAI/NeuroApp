const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkLocations() {
  console.log('=== Verificando locations estranhas ===\n');

  // Find all distinct locations
  const exams = await prisma.exam.findMany({
    select: {
      id: true,
      location: true,
      eyerCloudId: true,
      patient: {
        select: {
          name: true,
          id: true
        }
      }
    }
  });

  // Group by location
  const locationGroups = {};
  for (const exam of exams) {
    const loc = exam.location || 'NULL';
    if (!locationGroups[loc]) {
      locationGroups[loc] = [];
    }
    locationGroups[loc].push(exam);
  }

  console.log('Locations encontradas:\n');
  const locations = Object.keys(locationGroups).sort();

  for (const loc of locations) {
    const count = locationGroups[loc].length;
    const isIdLike = /^[0-9a-f]{24}$/i.test(loc);

    if (isIdLike) {
      console.log(`❌ ${loc} (${count} exames) - PARECE ID!`);
      // Show first 3 patients
      locationGroups[loc].slice(0, 3).forEach(e => {
        console.log(`   - ${e.patient.name}`);
      });
      console.log();
    } else {
      console.log(`✓ ${loc} (${count} exames)`);
    }
  }

  // Count strange ones
  const strangeCount = locations.filter(loc => /^[0-9a-f]{24}$/i.test(loc)).length;
  console.log(`\n=== Summary ===`);
  console.log(`Total locations: ${locations.length}`);
  console.log(`Strange (ID-like) locations: ${strangeCount}`);

  await prisma.$disconnect();
}

checkLocations().catch(console.error);
