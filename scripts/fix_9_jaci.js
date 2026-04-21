const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXECUTE = process.argv.includes('--execute');

const FIXES = [
  { examId: '699fa6717dd15877d9096028', name: 'CARMEN MARIA SOUZA LIMA',          date: '2026-02-25' },
  { examId: '699fa67195fe6b19f447bdf4', name: 'DULCE NIEHUES DA SILVA',           date: '2026-02-25' },
  { examId: '699fa6727dd15877d909602a', name: 'JAIR VITORINO PEREIRA',            date: '2026-02-25' },
  { examId: '699fa67095fe6b19f447bdf3', name: 'JOELIA DOS SANTOS DA CONCEICAO',   date: '2026-02-25' },
  { examId: '699fa67195fe6b19f447bdf5', name: 'JOSE TADEU DA SILVA',              date: '2026-02-25' },
  { examId: '699fa6707dd15877d9096027', name: 'MARCIA CRISTINA GARUFFI RAMOS',    date: '2026-02-25' },
  { examId: '699fa67295fe6b19f447bdf7', name: 'MARIA JOSE MARINHO PEREIRA',       date: '2026-02-25' },
  { examId: '699fa6717dd15877d9096029', name: 'SIDNEIA BORGES OLIVEIRA DA COSTA', date: '2026-02-25' },
  { examId: '699fa67295fe6b19f447bdf6', name: 'VALDOMIRO FERREIRA PESSOA',        date: '2026-02-25' },
];

const LOCATION = 'Jaci-SP';

function ymd(d) { return d?.toISOString?.().slice(0, 10) ?? null; }

(async () => {
  console.log(EXECUTE ? '=== EXECUTE ===' : '=== PREVIEW (use --execute to apply) ===\n');

  for (const f of FIXES) {
    const ex = await prisma.exam.findUnique({
      where: { id: f.examId },
      include: { patient: { select: { name: true } } },
    });
    if (!ex) { console.log(`? ${f.name} — exam ${f.examId} NOT FOUND`); continue; }
    const newDate = new Date(`${f.date}T12:00:00Z`);
    console.log(`${EXECUTE ? 'FIX' : 'WILL'} ${ex.patient.name.padEnd(34)} | ${ymd(ex.examDate)} → ${f.date} | "${ex.location}" → "${LOCATION}"`);
    if (EXECUTE) {
      await prisma.exam.update({
        where: { id: f.examId },
        data: { examDate: newDate, location: LOCATION },
      });
    }
  }

  await prisma.$disconnect();
  console.log('\nDone.');
})();
