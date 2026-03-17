require('dotenv').config({ path: 'E:\\GitHub\\NeuroApp\\.env' })
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// Normalize name: uppercase, remove accents, trim, single-space
function normalizeName(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const RECOLETA_PATIENTS = [
  { name: 'AIRTON DE OLIVEIRA SANTOS',                     cpf: '063.128.088-07', nasc: '23/10/1964' },
  { name: 'ANDREA LUZIA VIEIRA',                           cpf: '323.476.868-44', nasc: '13/12/1981' },
  { name: 'ANTONIA LAJUDE CAMACHO MUNHOZ',                 cpf: '245.789.118-37', nasc: '10/08/1957' },
  { name: 'ANTONIO RIBEIRO ROCHA',                         cpf: '077.922.178-84', nasc: '08/09/1954' },
  { name: 'APARECIDA DE FATIMA PERENCINE SOARES',          cpf: '181.529.318-70', nasc: '20/01/1962' },
  { name: 'APARECIDO ROBERTO LOCAISE',                     cpf: null,             nasc: '06/06/1962' },
  { name: 'AUXILIADORA REGINA DO NASCIMENTO',              cpf: '278.624.788-86', nasc: '23/03/1975' },
  { name: 'CLAUDIONOR RODRIGUES SOBRINHO',                 cpf: '133.419.418-19', nasc: '28/01/1970' },
  { name: 'CLEMENTE ISMAEL ROCHI GALLE',                   cpf: '084.676.908-52', nasc: '05/12/1953' },
  { name: 'DORLINDA CRIPA FERREIRA',                       cpf: null,             nasc: '30/05/1943' },
  { name: 'ELISA DE LOURDES VIEIRA DUARTE',                cpf: '278.989.018-86', nasc: '25/12/1966' },
  { name: 'ELUZIA PERPUTO NOGUEIRA DALOLEO',               cpf: '133.510.028-82', nasc: '29/03/1975' },
  { name: 'GUILHERME CONSTATINO BORGES DA SILVA',          cpf: '159.394.018-13', nasc: '21/03/1974' },
  { name: 'HELENICE APARECIDA MAXIMO DINIZ BISTAFA',       cpf: '288.368.248-89', nasc: '07/10/1972' },
  { name: 'HELIO PEROMINGO',                               cpf: null,             nasc: '26/09/1949' },
  { name: 'JAIR APARECIDO GORGATTO',                       cpf: '076.513.578-76', nasc: '19/11/1958' },
  { name: 'JAIR EMIDIO DE TOLEDO',                         cpf: '649.442.478-34', nasc: '11/03/1951' },
  { name: 'JOSE ANGELO DE OLIVEIRA',                       cpf: '084.804.458-40', nasc: '02/10/1962' },
  { name: 'LEUDOVINIA DONIZETE MENDONCA MARTINELLI',       cpf: '263.489.018-40', nasc: '15/06/1960' },
  { name: 'MARCOS ANTONIO FORLA',                          cpf: '109.502.028-51', nasc: '21/09/1968' },
  { name: 'MARIA AUZELI ALVES DA SILVA DURAN',             cpf: '359.506.228-04', nasc: '27/10/1971' },
  { name: 'MARIA CIPIONATO DEROID',                        cpf: null,             nasc: '13/09/1939' },
  { name: 'MARIA DE LOURDES VIEIRA CREMONIN',              cpf: '184.582.458-09', nasc: '10/03/1959' },
  { name: 'MARIA HELENA ALVES DE GERVASIO',                cpf: '837.471.331-34', nasc: '15/01/1978' },
  { name: 'MARIA HELENA IDE SECATO',                       cpf: '301.319.768-42', nasc: '11/06/1955' },
  { name: 'MAURICIO ZANIBONI',                             cpf: '109.331.038-32', nasc: '12/01/1969' },
  { name: 'NILTON FERREIRA DIAS',                          cpf: '042.006.308-00', nasc: '25/12/1951' },
  { name: 'SUELI FATIMA DA CUNHA DE SOUZA',                cpf: '181.438.348-40', nasc: '13/10/1966' },
]

async function main() {
  console.log('='.repeat(100))
  console.log('VERIFICACAO DE PACIENTES - LISTA RECOLETA JACI')
  console.log('='.repeat(100))
  console.log()

  const results = []

  for (let i = 0; i < RECOLETA_PATIENTS.length; i++) {
    const entry = RECOLETA_PATIENTS[i]
    const normalized = normalizeName(entry.name)

    // Search by name (case-insensitive contains on the raw name, then filter)
    const candidates = await prisma.patient.findMany({
      where: {
        name: {
          contains: normalized.split(' ')[0], // search by first word at minimum
          mode: 'insensitive',
        },
      },
      include: {
        exams: {
          orderBy: { examDate: 'desc' },
          include: {
            images: { select: { id: true } },
            report: {
              select: {
                id: true,
                findings: true,
                diagnosis: true,
                doctorName: true,
                completedAt: true,
              },
            },
          },
        },
      },
    })

    // Find best match by normalized name
    let match = null
    for (const c of candidates) {
      if (normalizeName(c.name) === normalized) {
        match = c
        break
      }
    }

    // If no exact match, try partial: all words present
    if (!match) {
      const words = normalized.split(' ')
      for (const c of candidates) {
        const cNorm = normalizeName(c.name)
        if (words.every(w => cNorm.includes(w))) {
          match = c
          break
        }
      }
    }

    const latestExam = match?.exams?.[0] || null
    const report = latestExam?.report || null
    const imageCount = latestExam?.images?.length ?? 0

    results.push({
      n: i + 1,
      searchName: entry.name,
      cpf: entry.cpf || 'N/I',
      nasc: entry.nasc,
      found: !!match,
      dbName: match?.name || '—',
      dbId: match?.id || '—',
      examDate: latestExam ? latestExam.examDate.toISOString().slice(0, 10) : '—',
      location: latestExam?.location || '—',
      examStatus: latestExam?.status || '—',
      imageCount,
      hasReport: !!report,
      reportSnippet: report ? (report.findings || report.diagnosis || '').slice(0, 80) : '—',
      reportDoctor: report?.doctorName || '—',
      allExams: match?.exams?.length || 0,
    })
  }

  // Print results table
  console.log(`#  | LISTA RECOLETA                                        | ENCONTRADO | NOME NO DB                                    | LOCAL         | STATUS    | IMGS | LAUDO`)
  console.log('-'.repeat(180))

  let foundCount = 0
  let withReportCount = 0
  let pendingCount = 0
  let completedCount = 0

  for (const r of results) {
    if (r.found) foundCount++
    if (r.hasReport) withReportCount++
    if (r.examStatus === 'pending') pendingCount++
    if (r.examStatus === 'completed') completedCount++

    const found = r.found ? 'SIM' : 'NAO'
    const report = r.hasReport ? `SIM - ${r.reportSnippet.substring(0, 50)}` : 'NAO'
    console.log(
      `${String(r.n).padStart(2)} | ${r.searchName.padEnd(53)} | ${found.padEnd(10)} | ${r.dbName.padEnd(45)} | ${r.location.padEnd(13)} | ${r.examStatus.padEnd(9)} | ${String(r.imageCount).padStart(4)} | ${report}`
    )
  }

  console.log()
  console.log('='.repeat(100))
  console.log('RESUMO DOS 28 PACIENTES DA LISTA:')
  console.log(`  Encontrados no DB: ${foundCount}/28`)
  console.log(`  NAO encontrados:   ${28 - foundCount}/28`)
  console.log(`  Com laudo:         ${withReportCount}`)
  console.log(`  Status pending:    ${pendingCount}`)
  console.log(`  Status completed:  ${completedCount}`)
  console.log()

  // List not found
  const notFound = results.filter(r => !r.found)
  if (notFound.length > 0) {
    console.log('PACIENTES NAO ENCONTRADOS:')
    notFound.forEach(r => console.log(`  ${r.n}. ${r.searchName} (CPF: ${r.cpf}, Nasc: ${r.nasc})`))
    console.log()
  }

  // List found without report
  const foundNoReport = results.filter(r => r.found && !r.hasReport)
  if (foundNoReport.length > 0) {
    console.log('ENCONTRADOS SEM LAUDO:')
    foundNoReport.forEach(r => console.log(`  ${r.n}. ${r.dbName} | ${r.location} | ${r.examStatus} | ${r.imageCount} imgs`))
    console.log()
  }

  // Reverse check: all Jaci patients
  console.log('='.repeat(100))
  console.log('VERIFICACAO REVERSA: TODOS OS PACIENTES COM LOCATION CONTENDO "Jaci"')
  console.log('='.repeat(100))

  const jaciExams = await prisma.exam.findMany({
    where: {
      location: {
        contains: 'Jaci',
        mode: 'insensitive',
      },
    },
    include: {
      patient: { select: { id: true, name: true, cpf: true, birthDate: true } },
      images: { select: { id: true } },
      report: { select: { id: true, doctorName: true, completedAt: true } },
    },
    orderBy: { examDate: 'asc' },
  })

  // Deduplicate by patient (keep latest exam per patient)
  const patientMap = new Map()
  for (const exam of jaciExams) {
    const pid = exam.patient.id
    if (!patientMap.has(pid)) {
      patientMap.set(pid, { patient: exam.patient, latestExam: exam, examCount: 1 })
    } else {
      patientMap.get(pid).examCount++
      // keep latest
      if (exam.examDate > patientMap.get(pid).latestExam.examDate) {
        patientMap.get(pid).latestExam = exam
      }
    }
  }

  const jaciPatients = Array.from(patientMap.values()).sort((a, b) =>
    a.patient.name.localeCompare(b.patient.name)
  )

  console.log(`Total de exames Jaci: ${jaciExams.length}`)
  console.log(`Total de pacientes Jaci (dedup): ${jaciPatients.length}`)
  console.log()
  console.log(`#   | NOME NO DB                                              | CPF              | NASC       | STATUS    | IMGS | LAUDO`)
  console.log('-'.repeat(130))

  let jaciWithReport = 0
  let jaciPending = 0
  let jaciCompleted = 0

  jaciPatients.forEach((entry, idx) => {
    const { patient, latestExam } = entry
    const hasReport = !!latestExam.report
    if (hasReport) jaciWithReport++
    if (latestExam.status === 'pending') jaciPending++
    if (latestExam.status === 'completed') jaciCompleted++

    const birthStr = patient.birthDate
      ? new Date(patient.birthDate).toLocaleDateString('pt-BR')
      : 'N/I'
    const cpfStr = patient.cpf || 'N/I'
    const imgCount = latestExam.images.length
    const reportStr = hasReport ? `SIM (${latestExam.report.doctorName || '?'})` : 'NAO'

    console.log(
      `${String(idx + 1).padStart(3)} | ${patient.name.padEnd(55)} | ${cpfStr.padEnd(16)} | ${birthStr.padEnd(10)} | ${latestExam.status.padEnd(9)} | ${String(imgCount).padStart(4)} | ${reportStr}`
    )
  })

  console.log()
  console.log('RESUMO JACI:')
  console.log(`  Total pacientes Jaci: ${jaciPatients.length}`)
  console.log(`  Com laudo:            ${jaciWithReport}`)
  console.log(`  Pending:              ${jaciPending}`)
  console.log(`  Completed:            ${jaciCompleted}`)
  console.log()

  // Cross-reference: which recoleta patients are in the Jaci list?
  console.log('='.repeat(100))
  console.log('CRUZAMENTO: PACIENTES RECOLETA vs LISTA JACI NO DB')
  console.log('='.repeat(100))

  const jaciNormalizedNames = new Set(jaciPatients.map(e => normalizeName(e.patient.name)))

  console.log()
  console.log('Pacientes da lista recoleta que ESTAO na lista Jaci do DB:')
  let crossCount = 0
  results.forEach(r => {
    if (r.found && jaciNormalizedNames.has(normalizeName(r.dbName))) {
      crossCount++
      console.log(`  + ${r.dbName} | ${r.location} | ${r.examStatus} | ${r.imageCount} imgs | laudo: ${r.hasReport ? 'SIM' : 'NAO'}`)
    }
  })
  console.log(`  Total: ${crossCount}`)

  console.log()
  console.log('Pacientes da lista recoleta encontrados no DB mas NAO em Jaci:')
  results.forEach(r => {
    if (r.found && !jaciNormalizedNames.has(normalizeName(r.dbName))) {
      console.log(`  ? ${r.dbName} | location: "${r.location}" | ${r.examStatus}`)
    }
  })

  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  prisma.$disconnect()
  process.exit(1)
})
