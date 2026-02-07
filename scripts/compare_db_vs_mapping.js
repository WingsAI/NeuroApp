const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
    // Load mapping
    const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    const mappingEntries = Object.entries(mapping);

    // Load DB
    const dbExams = await prisma.exam.findMany({
        include: { patient: { select: { name: true } }, images: { select: { id: true } } }
    });

    const dbPatients = await prisma.patient.findMany({ select: { id: true, name: true } });

    console.log('=== COUNTS ===');
    console.log(`  Mapping entries: ${mappingEntries.length}`);
    console.log(`  DB Patients: ${dbPatients.length}`);
    console.log(`  DB Exams: ${dbExams.length}`);

    // Build sets
    const mappingExamIds = new Set();
    const mappingPatientNames = new Set();
    for (const [key, entry] of mappingEntries) {
        if (entry.exam_id) mappingExamIds.add(entry.exam_id);
        if (entry.patient_name) mappingPatientNames.add(entry.patient_name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    }

    // Group mapping by unique patient (name + birthday)
    const mappingPatients = {};
    for (const [key, entry] of mappingEntries) {
        const name = (entry.patient_name || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const bday = entry.birthday || 'unknown';
        const pKey = `${name}|${bday}`;
        if (!mappingPatients[pKey]) mappingPatients[pKey] = { name: entry.patient_name, exams: [] };
        mappingPatients[pKey].exams.push(entry.exam_id);
    }

    console.log(`  Unique patients in mapping (by name+birthday): ${Object.keys(mappingPatients).length}`);
    console.log(`  Unique exam_ids in mapping: ${mappingExamIds.size}`);

    // Find mapping exams NOT in DB
    const dbEyerIds = new Set();
    const dbEyerIdPrefixes = new Set();
    for (const e of dbExams) {
        if (e.eyerCloudId) {
            dbEyerIds.add(e.eyerCloudId);
            dbEyerIdPrefixes.add(e.eyerCloudId.substring(0, 8));
        }
    }
    // Also add exam IDs themselves
    for (const e of dbExams) {
        dbEyerIds.add(e.id);
        dbEyerIdPrefixes.add(e.id.substring(0, 8));
    }

    console.log('\n=== MAPPING EXAMS NOT IN DB ===');
    const missingFromDb = [];
    for (const [key, entry] of mappingEntries) {
        const examId = entry.exam_id;
        if (!examId) continue;

        const prefix = examId.substring(0, 8);
        // Check if this exam is in DB by full ID or by prefix match
        const inDbFull = dbEyerIds.has(examId);
        const inDbPrefix = dbEyerIdPrefixes.has(prefix);

        if (!inDbFull && !inDbPrefix) {
            missingFromDb.push({
                name: entry.patient_name,
                examId: examId,
                hasImages: (entry.images || []).length > 0,
                imageCount: (entry.images || []).length
            });
        }
    }

    console.log(`  Total mapping exams not found in DB: ${missingFromDb.length}`);
    if (missingFromDb.length > 0) {
        console.log('\n  Missing exams:');
        for (const m of missingFromDb) {
            console.log(`    ${m.name.padEnd(45)} | ExamID: ${m.examId} | Images: ${m.imageCount}`);
        }
    }

    // Find DB exams NOT in mapping
    console.log('\n=== DB EXAMS NOT IN MAPPING ===');
    const dbOnlyExams = [];
    for (const e of dbExams) {
        const eyerId = e.eyerCloudId || e.id;
        const prefix = eyerId.substring(0, 8);

        let foundInMapping = false;
        for (const [key, entry] of mappingEntries) {
            if (entry.exam_id) {
                if (entry.exam_id === eyerId || entry.exam_id.substring(0, 8) === prefix) {
                    foundInMapping = true;
                    break;
                }
            }
        }

        if (!foundInMapping) {
            dbOnlyExams.push({
                examId: e.id,
                eyerCloudId: e.eyerCloudId,
                patientName: e.patient.name,
                imageCount: e.images.length,
                status: e.status
            });
        }
    }

    console.log(`  Total DB exams not found in mapping: ${dbOnlyExams.length}`);
    if (dbOnlyExams.length > 0) {
        console.log('\n  DB-only exams:');
        for (const e of dbOnlyExams) {
            console.log(`    ${e.patientName.padEnd(45)} | ExamID: ${e.examId.substring(0, 20)}... | EyerID: ${e.eyerCloudId} | Imgs: ${e.imageCount} | ${e.status}`);
        }
    }

    // Summary of patients in mapping but not in DB
    console.log('\n=== PATIENTS IN MAPPING BUT NOT IN DB ===');
    const dbPatientNames = new Set(dbPatients.map(p => p.name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')));

    const missingPatients = [];
    for (const [pKey, pData] of Object.entries(mappingPatients)) {
        const normName = pKey.split('|')[0];
        if (!dbPatientNames.has(normName)) {
            missingPatients.push({ name: pData.name, exams: pData.exams.length });
        }
    }

    console.log(`  Total: ${missingPatients.length}`);
    for (const p of missingPatients) {
        console.log(`    ${p.name} (${p.exams} exams)`);
    }

    await prisma.$disconnect();
}
main().catch(console.error);
