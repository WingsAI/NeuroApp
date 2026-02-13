const fs = require('fs');
const path = require('path');

async function main() {
    const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
    if (!fs.existsSync(statePath)) {
        console.error('State file not found');
        return;
    }

    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const exams = state.exam_details || {};

    const prefixMap = {};

    for (const [id, data] of Object.entries(exams)) {
        const prefix = id.substring(0, 8);
        if (!prefixMap[prefix]) {
            prefixMap[prefix] = new Set();
        }
        prefixMap[prefix].add(data.patient_name);
    }

    console.log('Short ID (8-char prefix) Collisions in EyerCloud:');
    let collisions = 0;
    for (const [prefix, names] of Object.entries(prefixMap)) {
        if (names.size > 1) {
            collisions++;
            console.log(`Prefix: ${prefix} -> Patients: [${Array.from(names).join(', ')}]`);
        }
    }

    console.log(`\nTotal collisions found: ${collisions}`);
}

main();
