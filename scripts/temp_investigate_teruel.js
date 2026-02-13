const fs = require('fs');
const path = require('path');

async function main() {
    const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const exams = state.exam_details || {};

    console.log('Searching for GILBERTO and APARECIDO TERUEL:');
    for (const [id, data] of Object.entries(exams)) {
        if (data.patient_name.includes('GILBERTO') || data.patient_name.includes('APARECIDO TERUEL')) {
            console.log(`- ID: ${id}, Name: ${data.patient_name}, Prefix: ${id.substring(0, 8)}, CPF: "${data.cpf}"`);
        }
    }
}

main();
