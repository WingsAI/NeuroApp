const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }
function norm(s) { return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim(); }

const EXPECTED = [
  { name: 'CARMEN MARIA SOUZA LIMA',           date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'DULCE NIEHUES DA SILVA',            date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'JAIR VITORINO PEREIRA',             date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'JOELIA DOS SANTOS DA CONCEICAO',    date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'JOSE TADEU DA SILVA',               date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'MARCIA CRISTINA GARUFFI RAMOS',     date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'MARIA JOSE MARINHO PEREIRA',        date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'NEUSA RODRIGUES DA SILVA',          date: '2026-03-12', loc: 'Jaci-SP' },
  { name: 'RITA CASSIA LUNA DA SILVA',         date: '2026-03-09', loc: 'Jaci-SP' },
  { name: 'SIDNEIA BORGES OLIVEIRA DA COSTA',  date: '2026-02-25', loc: 'Jaci-SP' },
  { name: 'VALDOMIRO FERREIRA PESSOA',         date: '2026-02-25', loc: 'Jaci-SP' },
];

(async () => {
  const all = await prisma.patient.findMany({
    include: { exams: { include: { images: { select: { id: true } } } } },
  });

  for (const exp of EXPECTED) {
    const hits = all.filter((p) => norm(p.name) === norm(exp.name));
    if (hits.length === 0) { console.log(`? "${exp.name}" — NOT FOUND`); continue; }
    for (const p of hits) {
      for (const e of p.exams) {
        const dateOK = ymd(e.examDate) === exp.date;
        const locOK = e.location === exp.loc;
        const flag = dateOK && locOK ? 'OK ' : 'FIX';
        console.log(`${flag} ${p.name.padEnd(34)} | exam ${e.id} | ${ymd(e.examDate)} → ${exp.date} ${dateOK?'✓':'✗'} | "${e.location}" → "${exp.loc}" ${locOK?'✓':'✗'} | imgs=${e.images.length}`);
      }
    }
  }
  await prisma.$disconnect();
})();
