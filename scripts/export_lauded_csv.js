/**
 * Exporta CSV com todos os exames laudados (status: completed) do banco principal.
 *
 * Campos exportados:
 *   - Paciente: nome, CPF, data nascimento, idade, gênero, etnia, escolaridade, ocupação, telefone
 *   - Exame: data exame, local/unidade, técnico, data laudo, médico, CRM
 *   - Laudo: achados, diagnóstico, recomendações, conduta sugerida
 *   - Sinalizadores (diagnosticConditions): cada condição como coluna Sim/Não
 *   - Imagens selecionadas: URL OD, URL OE
 *   - Doenças de base e oftálmicas
 *   - Encaminhamento: especialidade, urgência
 *
 * Uso:
 *   node scripts/export_lauded_csv.js
 *   node scripts/export_lauded_csv.js --output relatorio_laudados.csv
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Parse args
const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : `laudados_${new Date().toISOString().slice(0,10)}.csv`;

function calcAge(birthDate) {
  if (!birthDate) return '';
  const today = new Date();
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime()) || birth.getFullYear() < 1900) return '';
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  return dt.toLocaleDateString('pt-BR');
}

function boolPT(val) {
  return val === true ? 'Sim' : 'Não';
}

function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function rowToCsv(row, headers) {
  return headers.map(h => escapeCsv(row[h] ?? '')).join(',');
}

async function main() {
  console.log('Buscando exames laudados no banco principal...');

  const exams = await prisma.exam.findMany({
    where: { status: 'completed' },
    include: {
      patient: true,
      report: true,
      referral: true,
      images: true,
    },
    orderBy: { examDate: 'asc' },
  });

  console.log(`Encontrados: ${exams.length} exames laudados`);

  const rows = [];

  for (const exam of exams) {
    const p = exam.patient;
    const r = exam.report;
    if (!r) continue; // completed mas sem laudo (improvável, mas seguro)

    const cond = r.diagnosticConditions || {};
    const sel = r.selectedImages || {};
    const under = p.underlyingDiseases || {};
    const opht = p.ophthalmicDiseases || {};

    // Resolve selected image URLs
    const imgById = {};
    for (const img of exam.images) imgById[img.id] = img;

    function resolveUrl(imgId) {
      if (!imgId) return '';
      if (imgById[imgId]) return imgById[imgId].url;
      return imgId; // fallback: return the ID if not found
    }

    const odUrl = resolveUrl(sel.od);
    const oeUrl = resolveUrl(sel.oe);

    const row = {
      // Paciente
      'Nome': p.name,
      'CPF': p.cpf || '',
      'Data Nascimento': formatDate(p.birthDate),
      'Idade': calcAge(p.birthDate),
      'Gênero': p.gender || '',
      'Etnia': p.ethnicity || '',
      'Escolaridade': p.education || '',
      'Ocupação': p.occupation || '',
      'Telefone': p.phone || '',

      // Exame
      'Data Exame': formatDate(exam.examDate),
      'Unidade/Local': exam.location || '',
      'Técnico': exam.technicianName || '',

      // Laudo
      'Data Laudo': formatDate(r.completedAt),
      'Médico': r.doctorName || '',
      'CRM': r.doctorCRM || '',
      'Achados': r.findings || '',
      'Diagnóstico': r.diagnosis || '',
      'Recomendações': r.recommendations || '',
      'Conduta Sugerida': r.suggestedConduct || '',

      // Sinalizadores / Condições diagnósticas
      'Cond: Retinopatia Diabética': boolPT(cond.diabeticRetinopathy),
      'Cond: Suspeita de Glaucoma': boolPT(cond.glaucomaSuspect),
      'Cond: DMRI': boolPT(cond.dmri),
      'Cond: Oclusão Vascular': boolPT(cond.vascularOcclusion),
      'Cond: Hipertensão Ocular': boolPT(cond.ocularHypertension),
      'Cond: Alteração de Nervo Óptico': boolPT(cond.opticNerveAlteration),
      'Cond: Catarata': boolPT(cond.cataract),
      'Cond: Pterígio': boolPT(cond.pterygium),
      'Cond: Drusas': boolPT(cond.drusen),
      'Cond: Distúrbios do Vítreo': boolPT(cond.vitreousDisorders),
      'Cond: Edema de Papila': boolPT(cond.papilEdema),
      'Cond: Buraco Macular / Membrana Epirret.': boolPT(cond.macularHole),
      'Cond: Alterações Pigmentares': boolPT(cond.pigmentaryChanges),
      'Cond: Distrofias Retinianas': boolPT(cond.retinalDystrophies),
      'Cond: Uveíte Prévia': boolPT(cond.priorUveitis),
      'Cond: Lesão Externa (Pálpebra/Córnea)': boolPT(cond.externalLesion),
      'Cond: Reconvocar Urgente': boolPT(cond.reconvocarUrgente),
      'Cond: Reconvocar': boolPT(cond.reconvocar),
      'Cond: Encaminhar': boolPT(cond.encaminhar),
      'Cond: Sem Alterações': boolPT(cond.normal),
      'AI Ready': boolPT(cond.aiReady),

      // Imagens selecionadas
      'Imagem OD (URL)': odUrl,
      'Imagem OE (URL)': oeUrl,

      // Doenças de base
      'DB: Diabetes': boolPT(under.diabetes),
      'DB: Hipertensão': boolPT(under.hypertension),
      'DB: Colesterol': boolPT(under.cholesterol),
      'DB: Tabagismo': boolPT(under.smoker),

      // Doenças oftálmicas (pré-existentes)
      'DO: Catarata': boolPT(opht.cataract),
      'DO: Glaucoma': boolPT(opht.glaucoma),
      'DO: Retinopatia Diabética': boolPT(opht.diabeticRetinopathy),
      'DO: Pterígio': boolPT(opht.pterygium),
      'DO: DMRI': boolPT(opht.dmri),
      'DO: Baixa Acuidade Visual': boolPT(opht.lowVisualAcuity),

      // Encaminhamento
      'Encaminhamento: Especialidade': exam.referral?.specialty || '',
      'Encaminhamento: Urgência': exam.referral?.urgency || '',
      'Encaminhamento: Notas': exam.referral?.notes || '',
    };

    rows.push(row);
  }

  if (rows.length === 0) {
    console.log('Nenhum laudo encontrado.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...rows.map(r => rowToCsv(r, headers)),
  ];

  const csvContent = '\uFEFF' + csvLines.join('\r\n'); // BOM for Excel UTF-8
  const outPath = path.resolve(outputFile);
  fs.writeFileSync(outPath, csvContent, 'utf8');

  console.log(`\n✅ CSV exportado: ${outPath}`);
  console.log(`   ${rows.length} pacientes laudados`);
  console.log(`   ${headers.length} colunas`);

  // Summary stats
  const byLocation = {};
  for (const r of rows) {
    const loc = r['Unidade/Local'] || 'Desconhecido';
    byLocation[loc] = (byLocation[loc] || 0) + 1;
  }
  console.log('\n  Por unidade:');
  for (const [loc, count] of Object.entries(byLocation).sort((a,b) => b[1]-a[1])) {
    console.log(`    ${loc}: ${count}`);
  }
}

main()
  .catch(e => { console.error('ERRO:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
