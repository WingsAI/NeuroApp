const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const prisma = new PrismaClient();

function norm(s) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}
function ymd(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  return '';
}

(async () => {
  const wb = XLSX.readFile('/Users/jv/Downloads/TeleSight_Laudos_Completo_2026-04-22.xlsx');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  console.log(`XLSX rows: ${rows.length}`);

  const wanted = new Set();
  const wantedNameOnly = new Set();
  for (const r of rows) {
    const n = norm(r['Nome do Paciente']);
    const b = ymd(r['Data de Nascimento']);
    if (!n) continue;
    wanted.add(`${n}|${b}`);
    wantedNameOnly.add(n);
  }
  console.log(`Unique name|birth keys: ${wanted.size}`);
  console.log(`Unique name-only keys: ${wantedNameOnly.size}`);

  const patients = await prisma.patient.findMany({
    include: { exams: { include: { report: { select: { id: true } } } } },
  });
  console.log(`DB patients: ${patients.length}`);

  let matched = 0;
  let matchedWithReport = 0;
  const missingFromDb = [];
  for (const r of rows) {
    const n = norm(r['Nome do Paciente']);
    const b = ymd(r['Data de Nascimento']);
    const cand = patients.filter((p) => norm(p.name) === n);
    const hit = cand.find((p) => ymd(p.birthDate) === b) || cand[0];
    if (hit) {
      matched++;
      const hasReport = hit.exams.some((e) => e.status === 'completed' && e.report);
      if (hasReport) matchedWithReport++;
    } else {
      missingFromDb.push({ name: r['Nome do Paciente'], birth: r['Data de Nascimento'], unit: r['Unidade/Localização'] });
    }
  }
  console.log(`Matched by name (any birth): ${matched}/${rows.length}`);
  console.log(`Matched AND has completed report: ${matchedWithReport}/${rows.length}`);
  if (missingFromDb.length) {
    console.log(`\nNot found in DB (${missingFromDb.length}):`);
    missingFromDb.slice(0, 30).forEach((m) => console.log(`  "${m.name}" | ${m.birth} | ${m.unit}`));
    if (missingFromDb.length > 30) console.log(`  ...(+${missingFromDb.length - 30})`);
  }

  await prisma.$disconnect();
})();
