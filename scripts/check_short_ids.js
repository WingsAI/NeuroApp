const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    // 1. Get the 7 short-ID patients
    const patients = await prisma.patient.findMany({
        where: { id: { startsWith: '6984' } },
        include: { exams: { include: { images: { select: { id: true, type: true } }, report: { select: { id: true } } } } }
    });

    console.log('=== 7 SHORT-ID PATIENTS (6984cba*) ===');
    for (const p of patients) {
        console.log(`\n  ${p.name} (ID: ${p.id})`);
        console.log(`    Created: ${p.createdAt}`);
        console.log(`    BirthDate: ${p.birthDate}`);
        console.log(`    CPF: ${p.cpf}`);
        for (const e of p.exams) {
            console.log(`    Exam: ${e.id} | eyerCloudId: ${e.eyerCloudId} | Images: ${e.images.length} | Report: ${e.report ? 'YES' : 'no'}`);
            console.log(`      Location: ${e.location} | Date: ${e.examDate}`);
            const types = {};
            e.images.forEach(img => { types[img.type || 'null'] = (types[img.type || 'null'] || 0) + 1; });
            console.log(`      Image types: ${JSON.stringify(types)}`);
        }
    }

    // 2. Check if these IDs exist in the mapping file
    const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));

    console.log('\n=== MAPPING FILE SEARCH ===');
    for (const p of patients) {
        const shortId = p.id;
        const matches = [];
        for (const [key, entry] of Object.entries(mapping)) {
            if (entry.exam_id && entry.exam_id.startsWith(shortId)) {
                matches.push({ key, exam_id: entry.exam_id, name: entry.patient_name });
            }
        }
        console.log(`  ${p.name} (${shortId}): ${matches.length} matches in mapping`);
        matches.forEach(m => console.log(`    -> ${m.exam_id} (${m.name})`));
    }

    // 3. Check the download_state.json
    const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
    if (fs.existsSync(STATE_PATH)) {
        const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        const details = state.exam_details || {};

        console.log('\n=== DOWNLOAD STATE SEARCH ===');
        for (const p of patients) {
            const shortId = p.id;
            const matches = [];
            for (const [fullId, detail] of Object.entries(details)) {
                if (fullId.startsWith(shortId)) {
                    matches.push({ fullId, name: detail.patient_name });
                }
            }
            console.log(`  ${p.name} (${shortId}): ${matches.length} matches in download_state`);
            matches.forEach(m => console.log(`    -> ${m.fullId} (${m.name})`));
        }
    }

    // 4. Check ALL IDs starting with 6984 in mapping
    console.log('\n=== ALL 6984* ENTRIES IN MAPPING ===');
    for (const [key, entry] of Object.entries(mapping)) {
        if (entry.exam_id && entry.exam_id.startsWith('6984')) {
            console.log(`  ${entry.patient_name}: ${entry.exam_id} (${entry.exam_id.length} chars)`);
        }
    }

    await prisma.$disconnect();
}
main().catch(console.error);
