const fs = require('fs');
const path = require('path');

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');

function analyze() {
    if (!fs.existsSync(MAPPING_PATH)) {
        console.error('Mapping not found');
        return;
    }

    const mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    const entries = Object.entries(mapping);

    console.log('Total entries:', entries.length);

    const imageTypes = {};
    let totalImages = 0;

    const patientsByName = {};

    entries.forEach(([key, data]) => {
        const name = data.patient_name.trim().toUpperCase();
        if (!patientsByName[name]) patientsByName[name] = [];
        patientsByName[name].push(key);

        data.images.forEach(img => {
            const type = img.type || 'N/A';
            imageTypes[type] = (imageTypes[type] || 0) + 1;
            totalImages++;
        });
    });

    console.log('\nImage Types:');
    console.log(JSON.stringify(imageTypes, null, 2));
    console.log('Total Images:', totalImages);

    console.log('\nUnique Names:', Object.keys(patientsByName).length);

    const dupNames = Object.entries(patientsByName).filter(([n, ids]) => ids.length > 1);
    console.log('Duplicate Names in Mapping:', dupNames.length);
}

analyze();
