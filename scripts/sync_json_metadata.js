const fs = require('fs');
const path = require('path');

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const STATE_PATH = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

function loadJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function saveJSON(p, d) { fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8'); }

function getNewLocation(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const day = d.getUTCDate();
    const month = d.getUTCMonth() + 1;
    const year = d.getUTCFullYear();

    if (year === 2026) {
        if (month === 1) {
            if (day <= 15) return 'Tauá-CE';
            if (day >= 27 && day <= 31) return 'Jaci-SP';
        } else if (month === 2) {
            if (day >= 2 && day <= 6) return 'Campos do Jordão-SP';
        }
    }
    return null;
}

function syncJSON() {
    console.log("🔄 Sincronizando arquivos JSON com as regras de localização...");

    // 1. Update Mapping
    const mapping = loadJSON(MAPPING_PATH);
    let mappingUpdated = 0;
    for (const key in mapping) {
        const item = mapping[key];
        const loc = getNewLocation(item.exam_date);
        if (loc) {
            item.clinic_name = loc;
            mappingUpdated++;
        }
    }
    saveJSON(MAPPING_PATH, mapping);
    console.log(`✅ ${mappingUpdated} exames atualizados no bytescale_mapping_cleaned.json`);

    // 2. Update State
    const state = loadJSON(STATE_PATH);
    let stateUpdated = 0;
    for (const id in state.exam_details) {
        const item = state.exam_details[id];
        const loc = getNewLocation(item.exam_date);
        if (loc) {
            item.clinic_name = loc;
            stateUpdated++;
        }

        // Fix Adriana specific
        if (item.patient_name && item.patient_name.includes('ADRIANA CARVALHO FERNANDES')) {
            item.underlying_diseases.hypertension = true;
            item.underlying_diseases.cholesterol = true;
            console.log("🧬 Adriana corrigida no download_state.json");
        }
    }
    saveJSON(STATE_PATH, state);
    console.log(`✅ ${stateUpdated} exames atualizados no download_state.json`);
}

syncJSON();
