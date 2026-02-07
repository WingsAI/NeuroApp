const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'eyercloud_downloader');
const CLEANED_PATH = path.join(DIR, 'bytescale_mapping_cleaned.json');
const V2_PATH = path.join(DIR, 'bytescale_mapping_v2.json');
const STATE_PATH = path.join(DIR, 'download_state.json');

function loadJSON(p) { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {}; }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }

async function merge() {
    console.log("🔗 Mesclando mapeamentos...");

    const cleaned = loadJSON(CLEANED_PATH);
    const v2 = loadJSON(V2_PATH);
    const state = loadJSON(STATE_PATH);

    let added = 0;

    // Mescla V2 no Cleaned
    for (const key in v2) {
        if (!cleaned[key]) {
            cleaned[key] = v2[key];
            added++;
        }
    }

    console.log(`✅ Adicionados ${added} novos mapeamentos de V2.`);

    // Enriquece com dados do State
    let enriched = 0;
    for (const key in cleaned) {
        const item = cleaned[key];
        const examId = key.split('_').pop();

        // Se já tem dados do State no mapping, pula ou atualiza
        const stateEntry = state.exam_details ? state.exam_details[examId] : null;

        if (stateEntry) {
            item.exam_id = examId;
            item.patient_name = stateEntry.patient_name || item.patient_name;
            item.exam_date = stateEntry.exam_date || item.exam_date;
            item.cpf = stateEntry.cpf || item.cpf;
            item.birthday = stateEntry.birthday || item.birthday;
            item.gender = stateEntry.gender || item.gender;
            item.clinic_name = stateEntry.clinic_name || item.clinic_name;
            item.underlying_diseases = stateEntry.underlying_diseases || item.underlying_diseases;
            item.ophthalmic_diseases = stateEntry.ophthalmic_diseases || item.ophthalmic_diseases;
            enriched++;
        }
    }

    console.log(`✅ ${enriched} mapeamentos enriquecidos com metadados do state.`);

    saveJSON(CLEANED_PATH, cleaned);
    console.log(`💾 Salvo em: ${CLEANED_PATH}`);
}

merge().catch(console.error);
