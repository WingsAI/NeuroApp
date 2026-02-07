const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

async function listTargets() {
    console.log('--- RELATÓRIO DE POSSÍVEL LIMPEZA ---');

    // 1. Carrega IDs conhecidos do EyerCloud
    let knownIds = new Set();
    if (fs.existsSync(STATE_PATH)) {
        const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        state.downloaded_exams.forEach(id => knownIds.add(id));
        if (state.exam_details) {
            Object.keys(state.exam_details).forEach(id => knownIds.add(id));
        }
    }
    console.log(`IDs conhecidos no EyerCloud: ${knownIds.size}`);

    // 2. Busca tudo no banco
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: { report: true }
            }
        }
    });

    const manualPatients = [];
    const extraPatients = [];
    const validPatients = [];

    for (const p of patients) {
        const hasEyerId = p.exams.some(e => e.eyerCloudId && knownIds.has(e.eyerCloudId));
        const isManual = p.id.startsWith('manual-') || p.id.startsWith('pat-') && !p.exams.some(e => e.eyerCloudId);

        const hasReport = p.exams.some(e => e.report !== null);

        if (hasEyerId) {
            validPatients.push(p);
        } else if (isManual) {
            manualPatients.push({ name: p.name, id: p.id, hasReport });
        } else {
            // Tem ID ou formato de ID mas não está no nosso mapping atual
            extraPatients.push({ name: p.name, id: p.id, hasReport, eyerIds: p.exams.map(e => e.eyerCloudId).filter(Boolean) });
        }
    }

    console.log('\n--- 1. PACIENTES MANUAIS (Criados no App) ---');
    console.log(`Total: ${manualPatients.length}`);
    manualPatients.forEach(p => {
        console.log(`- ${p.name.padEnd(30)} | Laudo: ${p.hasReport ? 'SIM' : 'NÃO'} | ID: ${p.id}`);
    });

    console.log('\n--- 2. PACIENTES EXTRAS (Não encontrados no EyerCloud Sync recente) ---');
    console.log(`Total: ${extraPatients.length}`);
    extraPatients.forEach(p => {
        console.log(`- ${p.name.padEnd(30)} | Laudo: ${p.hasReport ? 'SIM' : 'NÃO'} | IDs Eyer: ${p.eyerIds.join(', ')}`);
    });

    console.log(`\nResumo:\n- Válidos: ${validPatients.length}\n- Manuais: ${manualPatients.length}\n- Extras: ${extraPatients.length}`);
    console.log('\nTotal no Banco:', patients.length);
}

listTargets()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
