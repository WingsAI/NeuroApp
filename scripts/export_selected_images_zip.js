#!/usr/bin/env node
/**
 * Export ALL selected (OD/OE) images from signed reports as a ZIP.
 * Names: <PatientName>_OD.jpg / _OE.jpg  (collision-safe with _<exam8>)
 *
 * Usage: node scripts/export_selected_images_zip.js [--out /path/to/file.zip]
 */
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { execFileSync } = require('child_process');

const prisma = new PrismaClient();

function sanitize(name) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_');
}

function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        return fetchBuffer(res.headers.location, redirects - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function resolveImage(images, id) {
  if (!id) return null;
  const hit = images.find(i => i.id === id);
  if (hit) return hit;
  const m = id.match(/-(\d+)$/);
  if (m) {
    const idx = parseInt(m[1]);
    if (idx < images.length) return images[idx];
  }
  return null;
}

async function main() {
  const outIdx = process.argv.indexOf('--out');
  const outZip = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1])
    : path.resolve(`selected_images_${Date.now()}.zip`);

  const reports = await prisma.medicalReport.findMany({
    where: { selectedImages: { not: null } },
    include: { exam: { include: { patient: true, images: true } } },
  });
  console.log(`Reports: ${reports.length}`);

  const patientIds = [...new Set(reports.map(r => r.exam.patientId))];
  const allExams = await prisma.exam.findMany({
    where: { patientId: { in: patientIds } },
    include: { images: true },
  });
  const examsByPatient = new Map();
  for (const e of allExams) {
    if (!examsByPatient.has(e.patientId)) examsByPatient.set(e.patientId, []);
    examsByPatient.get(e.patientId).push(...e.images);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selimgs-'));
  console.log(`Staging: ${tmpDir}`);

  const nameCount = new Map();
  let ok = 0, missing = 0, failed = 0;

  for (const r of reports) {
    const sel = r.selectedImages || {};
    const imgs = examsByPatient.get(r.exam.patientId) || r.exam.images;
    const base = sanitize(r.exam.patient.name || 'SemNome');

    for (const eye of ['od', 'oe']) {
      const id = sel[eye];
      if (!id) continue;
      const img = resolveImage(imgs, id);
      if (!img?.url) { missing++; continue; }

      const key = `${base}_${eye.toUpperCase()}`;
      const n = (nameCount.get(key) || 0) + 1;
      nameCount.set(key, n);
      const suffix = n > 1 ? `_${r.exam.id.slice(0, 8)}` : '';
      const ext = (img.url.match(/\.(jpe?g|png)(\?|$)/i)?.[1] || 'jpg').toLowerCase();
      const fname = `${key}${suffix}.${ext}`;

      try {
        const buf = await fetchBuffer(img.url);
        fs.writeFileSync(path.join(tmpDir, fname), buf);
        ok++;
        if (ok % 100 === 0) console.log(`  ${ok} saved...`);
      } catch (e) {
        failed++;
        console.log(`  FAIL ${fname}: ${e.message}`);
      }
    }
  }

  console.log(`\nZipping ${ok} files → ${outZip}`);
  execFileSync('zip', ['-rj', outZip, tmpDir], { stdio: 'inherit' });
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n✅ ${outZip}`);
  console.log(`   added: ${ok} | missing: ${missing} | failed: ${failed}`);
  console.log(`   size:  ${(fs.statSync(outZip).size / 1024 / 1024).toFixed(1)} MB`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
