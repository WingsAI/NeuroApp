const fs = require('fs');
const path = require('path');

const stateFile = path.join(__dirname, '..', 'scripts', 'eyercloud_downloader', 'download_state.json');
const mappingFile = path.join(__dirname, '..', 'public', 'bytescale_mapping.json');

function syncComorbidities() {
    console.log('Starting comorbidity sync...');

    if (!fs.existsSync(stateFile)) {
        console.error('State file not found at:', stateFile);
        return;
    }
    if (!fs.existsSync(mappingFile)) {
        console.error('Mapping file not found at:', mappingFile);
        return;
    }

    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));

    let updateCount = 0;
    let totalExamsWithDiseases = 0;

    // Create a map for faster lookup by exam_id
    const mappingEntries = Object.entries(mapping);

    for (const [exam_id, details] of Object.entries(state.exam_details || {})) {
        const diseases = details.underlying_diseases;
        if (!diseases) continue;

        const hasAnyDisease = diseases.diabetes || diseases.hypertension || diseases.cholesterol || diseases.smoker ||
            Object.values(details.ophthalmic_diseases || {}).some(v => v === true) ||
            details.otherDisease;

        if (hasAnyDisease) {
            totalExamsWithDiseases++;

            // Find matching patient in mapping
            for (const [key, mappingData] of mappingEntries) {
                if (mappingData.exam_id === exam_id) {
                    let changed = false;

                    // Compare and update underlying
                    if (JSON.stringify(mappingData.underlying_diseases) !== JSON.stringify(diseases)) {
                        mapping[key].underlying_diseases = diseases;
                        changed = true;
                    }

                    // Compare and update ophthalmic
                    if (JSON.stringify(mappingData.ophthalmic_diseases) !== JSON.stringify(details.ophthalmic_diseases)) {
                        mapping[key].ophthalmic_diseases = details.ophthalmic_diseases;
                        changed = true;
                    }

                    // Other disease
                    if (mappingData.otherDisease !== details.otherDisease) {
                        mapping[key].otherDisease = details.otherDisease;
                        changed = true;
                    }

                    if (changed) {
                        console.log(`Updating ${details.patient_name || key}`);
                        updateCount++;
                    }
                }
            }
        }
    }

    if (updateCount > 0) {
        fs.writeFileSync(mappingFile, JSON.stringify(mapping, null, 4), 'utf8');
        console.log(`Done! Updated ${updateCount} out of ${totalExamsWithDiseases} exams with diseases found.`);
    } else {
        console.log(`No updates needed. Checked ${totalExamsWithDiseases} exams with diseases.`);
    }
}

syncComorbidities();
