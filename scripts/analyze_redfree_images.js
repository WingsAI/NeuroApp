/**
 * analyze_redfree_images.js - REDFREE image identification analysis
 * Usage: node scripts/analyze_redfree_images.js [--exam EXAM_ID]
 */

const fs = require("fs");
const path = require("path");

const MAPPING_PATH = path.join(__dirname, "eyercloud_downloader", "bytescale_mapping_cleaned.json");
const DEBUG_PATH = path.join(__dirname, "eyercloud_downloader", "debug_exam_data.json");

const mapping = require(MAPPING_PATH);
const allKeys = Object.keys(mapping);
const fullIdKeys = allKeys.filter(k => k.split("_").pop().length === 24);
const shortIdKeys = allKeys.filter(k => k.split("_").pop().length === 8);

console.log("=".repeat(70));
console.log("REDFREE IMAGE IDENTIFICATION ANALYSIS");
console.log("=".repeat(70));

// 1. MARIA LUIZA
console.log("");
console.log("1. MARIA LUIZA (exam 695e55504b0e754dac3666c4)");
console.log("-".repeat(70));
const mariaKey = "MARIA_LUIZA_FERREIRA_MONTE_695e55504b0e754dac3666c4";
const mariaEntry = mapping[mariaKey];
if (mariaEntry) {
  console.log("   Total images: " + mariaEntry.images.length);
  mariaEntry.images.forEach((img, i) => {
    console.log("   " + (i + 1).toString().padStart(2) + ". " + img.filename);
  });
  const mariaShort = mapping["MARIA_LUIZA_FERREIRA_MONTE_695e5550"];
  if (mariaShort) {
    const fullSet = new Set(mariaEntry.images.map(i => i.filename));
    const shortSet = new Set(mariaShort.images.map(i => i.filename));
    const same = fullSet.size === shortSet.size && [...fullSet].every(f => shortSet.has(f));
    console.log("   Short-ID entry: " + mariaShort.images.length + " images. Same set: " + same);
  }
  const days = [...new Set(mariaEntry.images.map(i => i.upload_date.substring(0, 10)))].sort();
  console.log("   Upload batches:");
  days.forEach(day => {
    const batch = mariaEntry.images.filter(i => i.upload_date.startsWith(day));
    console.log("     " + day + ": " + batch.length + " images");
  });
}

// 2. Debug exam
console.log("");
console.log("2. NAIANA CRISTINA (exam 6970067426260539c16a97a8) - KNOWN TYPES");
console.log("-".repeat(70));
if (fs.existsSync(DEBUG_PATH)) {
  const debugData = require(DEBUG_PATH);
  const images = debugData.examDataList;
  const byType = {};
  images.forEach(img => { byType[img.type] = (byType[img.type] || 0) + 1; });
  console.log("   API: " + JSON.stringify(byType) + " = " + images.length + " total");
}

// 3. Image count distribution
console.log("");
console.log("3. IMAGE COUNT DISTRIBUTION");
console.log("-".repeat(70));
const countDist = {};
shortIdKeys.forEach(k => {
  const c = mapping[k].images.length;
  countDist[c] = (countDist[c] || 0) + 1;
});
Object.entries(countDist).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([count, freq]) => {
  const n = parseInt(count);
  const ant = n % 2 === 0 ? 2 : 1;
  const color = Math.floor((n - ant) / 2);
  const bar = "#".repeat(freq);
  console.log("   " + count.padStart(3) + " imgs: " + freq.toString().padStart(3) + " exams  " + bar + "  (~" + color + "C+" + color + "R+" + ant + "A)");
});
console.log("   Total: " + shortIdKeys.length + " exams, " + shortIdKeys.reduce((s, k) => s + mapping[k].images.length, 0) + " images");

// Summary
console.log("");
console.log("=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
let ec = 0, er = 0, ea = 0;
shortIdKeys.forEach(k => {
  const n = mapping[k].images.length;
  const ant = n % 2 === 0 ? 2 : 1;
  const color = Math.floor((n - ant) / 2);
  ec += color; er += color; ea += ant;
});
console.log("");
console.log("   DB: 7222 ExamImage (7163 COLOR + 59 ANTERIOR)");
console.log("   Estimated:");
console.log("     ~" + ec + " COLOR (keep)");
console.log("     ~" + er + " REDFREE (remove) = ~" + (er / (ec + er + ea) * 100).toFixed(0) + "%");
console.log("     ~" + ea + " ANTERIOR (keep)");
console.log("");
console.log("   RECOMMENDED: Fetch from EyerCloud API");
console.log("   /api/v2/eyercloud/examData/list?id={examId}");
console.log("   for " + shortIdKeys.length + " exams -> UUID->type mapping");