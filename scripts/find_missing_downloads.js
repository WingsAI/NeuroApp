const fs = require('fs');
const path = require('path');
const state = require('./eyercloud_downloader/download_state.json');

const downloadsDir = path.join(__dirname, 'eyercloud_downloader', 'downloads');

console.log('=== Finding Exams with Missing Downloads ===\n');

const examEntries = Object.entries(state.exam_details);
const missingDownloads = [];

for (const [examId, data] of examEntries) {
  if (!data.folder_name) continue;

  const folderPath = path.join(downloadsDir, data.folder_name);
  const exists = fs.existsSync(folderPath);

  if (!exists && data.expected_images > 0) {
    missingDownloads.push({
      patient: data.patient_name,
      examId,
      folder: data.folder_name,
      expected: data.expected_images
    });
  }
}

console.log(`Found ${missingDownloads.length} exams with missing downloads:\n`);

missingDownloads.slice(0, 20).forEach((exam, idx) => {
  console.log(`${idx + 1}. ${exam.patient}`);
  console.log(`   exam_id: ${exam.examId}`);
  console.log(`   folder: ${exam.folder}`);
  console.log(`   expected: ${exam.expected} images\n`);
});

if (missingDownloads.length > 20) {
  console.log(`... and ${missingDownloads.length - 20} more\n`);
}

console.log('Total missing:', missingDownloads.length);
