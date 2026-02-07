const { PrismaClient } = require('@prisma/client');
const path = require('path');

const mappingPath = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const statePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');

const mapping = require(mappingPath);
const downloadState = require(statePath);
const prisma = new PrismaClient();

async function main() {
  console.log('='.repeat(80));
  console.log('CHECK: Dia 5 (Feb 5, 2026) Patient Images Status');
  console.log('='.repeat(80));

  // PART 1: Download State
  console.log('');
  console.log('--- PART 1: download_state.json - Exams from Feb 5, 2026 ---');
  const feb5ExamIds = [];
  for (const [examId, details] of Object.entries(downloadState.exam_details || {})) {
    if (details.exam_date) {
      const d = new Date(details.exam_date);
      if (d >= new Date('2026-02-05T00:00:00Z') && d < new Date('2026-02-06T00:00:00Z')) {
        feb5ExamIds.push(examId);
        console.log('  ' + details.patient_name + ' | ' + examId + ' | ' + details.exam_date + ' | expected_imgs: ' + details.expected_images);
      }
    }
  }
  console.log('  TOTAL: ' + feb5ExamIds.length + ' exams from Feb 5 in download_state');

  // PART 2: Bytescale Mapping
  console.log('');
  console.log('--- PART 2: bytescale_mapping - Uploads on/after Feb 5 ---');
  const mappingFeb5 = {};
  for (const [key, entry] of Object.entries(mapping)) {
    const f5i = (entry.images || []).filter(function(img) { return img.upload_date && img.upload_date >= '2026-02-05'; });
    if (f5i.length > 0) {
      mappingFeb5[entry.exam_id] = {
        patient_name: entry.patient_name, exam_id: entry.exam_id,
        total_images: (entry.images||[]).length, feb5_plus_images: f5i.length,
        has_bytescale_urls: f5i.every(function(x){return !!x.bytescale_url;}),
        image_types: [...new Set(f5i.map(function(x){return x.type||'no-type';}))]
      };
    }
  }
  const mappingFeb5List = Object.values(mappingFeb5);
  for (const e of mappingFeb5List) {
    console.log('  ' + e.patient_name + ' | ' + e.exam_id + ' | total:' + e.total_images + ' | feb5+:' + e.feb5_plus_images + ' | urls:' + e.has_bytescale_urls + ' | types:' + e.image_types.join(','));
  }
  console.log('  TOTAL entries: ' + mappingFeb5List.length + ', TOTAL images: ' + mappingFeb5List.reduce(function(s,e){return s+e.feb5_plus_images;},0));

  // PART 3: Database
  console.log('');
  console.log('--- PART 3: Database - Exams with examDate on Feb 5 ---');
  const dbExams = await prisma.exam.findMany({
    where: { examDate: { gte: new Date('2026-02-05T00:00:00Z'), lt: new Date('2026-02-06T00:00:00Z') } },
    include: {
      patient: { select: { id: true, name: true } },
      images: { select: { id: true, url: true, type: true, fileName: true } },
      report: { select: { id: true } }
    },
    orderBy: { examDate: 'asc' }
  });
  if (dbExams.length === 0) { console.log('  NO exams found in DB for Feb 5.'); }
  else {
    for (const exam of dbExams) {
      const bsImgs = exam.images.filter(function(i){return i.url && i.url.includes('upcdn.io');});
      const s3Imgs = exam.images.filter(function(i){return i.url && i.url.includes('amazonaws.com');});
      console.log('  ' + exam.patient.name);
      console.log('    id:' + exam.id + ' eyerCloud:' + exam.eyerCloudId + ' patient:' + exam.patient.id);
      console.log('    date:' + exam.examDate.toISOString() + ' status:' + exam.status);
      console.log('    images:' + exam.images.length + ' total, ' + bsImgs.length + ' bytescale, ' + s3Imgs.length + ' S3');
      console.log('    types: ' + [...new Set(exam.images.map(function(i){return i.type||'null';}))].join(', '));
      console.log('    report: ' + (exam.report ? 'YES' : 'no'));
      console.log('');
    }
  }
  console.log('  TOTAL: ' + dbExams.length + ' exams in DB for Feb 5');

  // PART 4: Cross-reference
  console.log('');
  console.log('--- PART 4: Cross-reference ---');
  const dbEyerIds = new Set(dbExams.map(function(e){return e.eyerCloudId;}).filter(Boolean));
  const dbIds = new Set(dbExams.map(function(e){return e.id;}));
  const inBoth = [], stateOnly = [];
  for (const eid of feb5ExamIds) {
    if (dbEyerIds.has(eid) || dbIds.has(eid)) inBoth.push(eid); else stateOnly.push(eid);
  }
  console.log('  In BOTH db+state: ' + inBoth.length);
  inBoth.forEach(function(id){ const d=downloadState.exam_details[id]; console.log('    '+(d?d.patient_name:'?')+' | '+id); });
  console.log('  In state ONLY (not in DB): ' + stateOnly.length);
  stateOnly.forEach(function(id){ const d=downloadState.exam_details[id]; console.log('    '+(d?d.patient_name:'?')+' | '+id+' | bytescale:'+!!mappingFeb5[id]); });

  // PART 5: Broader range
  console.log('');
  console.log('--- PART 5: Database broader range (Feb 4-7) ---');
  const broad = await prisma.exam.findMany({
    where: { examDate: { gte: new Date('2026-02-04T00:00:00Z'), lt: new Date('2026-02-08T00:00:00Z') } },
    include: { patient: { select: { name: true } }, images: { select: { id: true, url: true } } },
    orderBy: { examDate: 'asc' }
  });
  for (const ex of broad) {
    const bs = ex.images.filter(function(i){return i.url&&i.url.includes('upcdn.io');}).length;
    const s3 = ex.images.filter(function(i){return i.url&&i.url.includes('amazonaws.com');}).length;
    console.log('  ' + ex.examDate.toISOString().split('T')[0] + ' | ' + ex.patient.name + ' | ' + ex.id + ' | imgs:' + ex.images.length + ' (' + bs + 'bs, ' + s3 + 's3)');
  }
  console.log('  TOTAL: ' + broad.length + ' exams in DB for Feb 4-7');

  // SUMMARY
  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('  download_state: ' + feb5ExamIds.length + ' exams from Feb 5');
  console.log('  bytescale_mapping: ' + mappingFeb5List.length + ' entries with uploads Feb 5+');
  console.log('  database: ' + dbExams.length + ' exams on Feb 5');
  console.log('  cross-ref: ' + inBoth.length + ' in both, ' + stateOnly.length + ' state-only');
  const totExp = feb5ExamIds.reduce(function(s,id){const d=downloadState.exam_details[id];return s+(d?d.expected_images||0:0);},0);
  const totMap = mappingFeb5List.filter(function(e){return feb5ExamIds.includes(e.exam_id);}).reduce(function(s,e){return s+e.feb5_plus_images;},0);
  const totDb = dbExams.reduce(function(s,e){return s+e.images.length;},0);
  console.log('  Expected images (EyerCloud): ' + totExp);
  console.log('  Images in bytescale mapping: ' + totMap);
  console.log('  Images in database: ' + totDb);
  const f5m = mappingFeb5List.filter(function(e){return feb5ExamIds.includes(e.exam_id);});
  console.log('  All have bytescale URLs: ' + (f5m.length > 0 && f5m.every(function(e){return e.has_bytescale_urls;}) ? 'YES' : 'NO'));
}

main().catch(console.error).finally(function(){return prisma.$disconnect();});

