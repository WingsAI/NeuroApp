const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

async function main() {
  const prisma = new PrismaClient();

  try {
    const patients = await prisma.patient.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    console.log(`Total patients found: ${patients.length}`);

    // Build tab-separated lines: id \t NAME (uppercase)
    const lines = patients.map((p) => `${p.id}\t${p.name.toUpperCase()}`);
    const txtContent = lines.join("\n") + "\n";

    // Save .txt
    const txtPath = path.join(__dirname, "db_patient_list.txt");
    fs.writeFileSync(txtPath, txtContent, "utf-8");
    console.log(`Saved ${txtPath}`);

    // Save .json (array of IDs only)
    const ids = patients.map((p) => p.id);
    const jsonPath = path.join(__dirname, "db_patient_ids.json");
    fs.writeFileSync(jsonPath, JSON.stringify(ids, null, 2) + "\n", "utf-8");
    console.log(`Saved ${jsonPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
