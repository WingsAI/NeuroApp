const { PrismaClient } = require("@prisma/client");
const downloadState = require("./eyercloud_downloader/download_state.json");
const bytescaleMapping = require("./eyercloud_downloader/bytescale_mapping_cleaned.json");
const prisma = new PrismaClient();

async function main() {
  const SEP = "=".repeat(80);
  console.log(SEP);
  console.log("  GAP ANALYSIS: NeuroApp Database vs EyerCloud Target");
  console.log("  Target: 451 patients, 456 EyerCloud exams");
  console.log(SEP);

  const stateExamIds = Object.keys(downloadState.exam_details);
  const downloadedExamIds = downloadState.downloaded_exams;
  const mappingKeys = Object.keys(bytescaleMapping);
  const mappingExamIds = [...new Set(mappingKeys.map(k => bytescaleMapping[k].exam_id))];

  console.log("");
  console.log("--- DATA SOURCE SIZES ---");
  console.log("download_state.exam_details: " + stateExamIds.length + " exams");
  console.log("download_state.downloaded_exams: " + downloadedExamIds.length + " exam IDs");
  console.log("bytescale_mapping: " + mappingKeys.length + " folder entries -> " + mappingExamIds.length + " unique exam_ids");

  const allPatients = await prisma.patient.findMany({
    include: { exams: { include: { images: true, report: true, referral: true } } }
  });
  const allExams = await prisma.exam.findMany({
    include: { images: true, report: true, patient: true }
  });

  const cmlExams = allExams.filter(e => e.id.startsWith("cml"));
  const eyerCloudExams = allExams.filter(e => !e.id.startsWith("cml"));
  const manualPatients = allPatients.filter(p => p.id.startsWith("manual-"));
  const eyerCloudPatients = allPatients.filter(p => !p.id.startsWith("manual-"));

  console.log("");
  console.log("--- DATABASE STATS ---");
  console.log("Total patients: " + allPatients.length);
  console.log("  EyerCloud patients: " + eyerCloudPatients.length);
  console.log("  Manual patients (manual-*): " + manualPatients.length);
  console.log("Total exams: " + allExams.length);
  console.log("  EyerCloud exams (non-cml): " + eyerCloudExams.length);
  console.log("  CML exams (cml*): " + cmlExams.length);

  // A)
  console.log(""); console.log(SEP);
  console.log("  A) EXAMS IN download_state NOT IN DATABASE");
  console.log(SEP);

  const dbExamEC = new Set(allExams.map(e => e.eyerCloudId).filter(Boolean));
  const dbExamIds = new Set(allExams.map(e => e.id));
  const allDbId = new Set([...dbExamIds, ...dbExamEC]);
  const notInDb = stateExamIds.filter(id => !allDbId.has(id));
  const inDbArr = stateExamIds.filter(id => allDbId.has(id));

  console.log("State exams found in DB: " + inDbArr.length);
  console.log("State exams MISSING from DB: " + notInDb.length);

  if (notInDb.length > 0) {
    console.log(""); console.log("Missing exams from state:");
    notInDb.forEach(id => {
      const d = downloadState.exam_details[id];
      console.log("  " + id + " - " + d.patient_name + " (" + d.clinic_name + ", " + (d.exam_date ? d.exam_date.substring(0, 10) : "no date") + ")");
    });
  }

  const missDesc = notInDb.filter(id => downloadState.exam_details[id].patient_name.toLowerCase().includes("desconhecido"));
  const missNamed = notInDb.filter(id => !downloadState.exam_details[id].patient_name.toLowerCase().includes("desconhecido"));
  console.log("");
  console.log("  Of missing: " + missDesc.length + " Desconhecido, " + missNamed.length + " named patients");

  // B)
  console.log(""); console.log(SEP);
  console.log("  B) EXAMS NEEDED TO REACH 456 (456 - 433 = 23 not in state)");
  console.log(SEP);

  const stSet = new Set(stateExamIds);
  const dbECNotSt = eyerCloudExams.filter(e => {
    const eid = e.eyerCloudId || e.id;
    return !stSet.has(eid) && !stSet.has(e.id);
  });

  console.log("EyerCloud exams in DB but NOT in download_state: " + dbECNotSt.length);
  if (dbECNotSt.length > 0) {
    console.log(""); console.log("These exams are in DB but not in state:");
    dbECNotSt.slice(0, 50).forEach(e => {
      console.log("  exam.id=" + e.id + " eyerCloudId=" + (e.eyerCloudId || "null") + " patient=" + (e.patient ? e.patient.name : "unknown"));
    });
    if (dbECNotSt.length > 50) console.log("  ... and " + (dbECNotSt.length - 50) + " more");
  }

  const mapNotSt = mappingExamIds.filter(id => !stSet.has(id));
  console.log("");
  console.log("Mapping exam_ids NOT in download_state: " + mapNotSt.length);
  if (mapNotSt.length > 0) {
    mapNotSt.forEach(id => {
      const fk = mappingKeys.find(k => bytescaleMapping[k].exam_id === id);
      const e = bytescaleMapping[fk];
      console.log("  " + id + " - " + e.patient_name + " (folder: " + fk + ")");
    });
  }

  const allKnown = new Set([...stateExamIds, ...mappingExamIds, ...eyerCloudExams.map(e => e.eyerCloudId || e.id)]);
  console.log("");
  console.log("Total unique EyerCloud exam IDs across ALL sources: " + allKnown.size);
  console.log("  Still unaccounted to reach 456: " + (456 - allKnown.size));

  // C)
  console.log(""); console.log(SEP);
  console.log("  C) DESCONHECIDO (Unknown) EXAMS");
  console.log(SEP);

  const stDesc = stateExamIds.filter(id => downloadState.exam_details[id].patient_name.toLowerCase().includes("desconhecido"));
  console.log("In download_state: " + stDesc.length + " Desconhecido exams");
  stDesc.forEach(id => {
    const d = downloadState.exam_details[id];
    const indb = allDbId.has(id);
    console.log("  " + id + " - clinic: " + d.clinic_name + ", date: " + (d.exam_date || "").substring(0, 10) + ", in DB: " + indb);
  });

  const dbDesc = allPatients.filter(p => p.name && p.name.toLowerCase().includes("desconhecido"));
  console.log("");
  console.log("In database (patients named Desconhecido): " + dbDesc.length);
  dbDesc.forEach(p => {
    console.log("  Patient " + p.id + " - " + p.name + ", exams: " + p.exams.length);
    p.exams.forEach(e => {
      console.log("    exam " + e.id + " eyerCloudId=" + (e.eyerCloudId || "null"));
    });
  });

  // D) CML EXAMS
  console.log(""); console.log(SEP);
  console.log("  D) CML EXAMS ANALYSIS");
  console.log(SEP);
  console.log("Total CML exams: " + cmlExams.length);

  let cmlWEC = 0, cmlMatch = 0;
  let cmlOrph = [], cmlDup = [];

  for (const c of cmlExams) {
    if (c.eyerCloudId) {
      cmlWEC++;
      const m = eyerCloudExams.find(e => e.id === c.eyerCloudId || e.eyerCloudId === c.eyerCloudId);
      if (m) {
        cmlMatch++;
        cmlDup.push({ cid: c.id, cec: c.eyerCloudId, mid: m.id, mec: m.eyerCloudId, name: c.patient ? c.patient.name : "unknown", cr: !!c.report, mr: !!m.report });
      } else {
        cmlOrph.push({ cid: c.id, ec: c.eyerCloudId, name: c.patient ? c.patient.name : "unknown", rep: !!c.report });
      }
    } else {
      cmlOrph.push({ cid: c.id, ec: null, name: c.patient ? c.patient.name : "unknown", rep: !!c.report });
    }
  }

  console.log("CML exams with eyerCloudId: " + cmlWEC);
  console.log("CML exams that DUPLICATE an EyerCloud exam: " + cmlMatch);
  console.log("CML exams that are ORPHANS: " + cmlOrph.length);

  if (cmlDup.length > 0) {
    console.log(""); console.log("CML duplicates of EyerCloud exams:");
    cmlDup.forEach(d => {
      console.log("  " + d.cid + " -> eyerCloud " + d.cec);
      console.log("    matches exam " + d.mid + " (eyerCloudId=" + d.mec + ")");
      console.log("    patient: " + d.name + " | cml report: " + d.cr + ", matched report: " + d.mr);
    });
  }

  if (cmlOrph.length > 0) {
    console.log(""); console.log("CML orphans (no matching EyerCloud exam in DB):");
    cmlOrph.forEach(o => {
      const inSt = o.ec ? stSet.has(o.ec) : false;
      console.log("  " + o.cid + " eyerCloudId=" + (o.ec || "null") + " patient=" + o.name + " report=" + o.rep + " inState=" + inSt);
    });
  }

  // E) PATIENTS IN STATE NOT IN DB
  console.log(""); console.log(SEP);
  console.log("  E) PATIENTS IN download_state NOT IN DATABASE");
  console.log(SEP);

  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const stPats = {};
  for (const eid of stateExamIds) {
    const d = downloadState.exam_details[eid];
    const nn = normalize(d.patient_name);
    if (!stPats[nn]) stPats[nn] = { name: d.patient_name, eids: [], bday: d.birthday };
    stPats[nn].eids.push(eid);
  }

  const dbPats = {};
  for (const p of allPatients) {
    if (p.name) {
      const nn = normalize(p.name);
      if (!dbPats[nn]) dbPats[nn] = [];
      dbPats[nn].push(p);
    }
  }

  const spNames = Object.keys(stPats);
  const missPats = spNames.filter(n => !dbPats[n]);
  const foundPats = spNames.filter(n => dbPats[n]);

  console.log("Unique patient names in state: " + spNames.length);
  console.log("  Found in DB: " + foundPats.length);
  console.log("  MISSING from DB: " + missPats.length);

  if (missPats.length > 0) {
    console.log(""); console.log("Missing patients:");
    missPats.forEach(n => {
      const sp = stPats[n];
      console.log("  " + sp.name + " - " + sp.eids.length + " exam(s): " + sp.eids.join(", "));
    });
  }

  const missPatsND = missPats.filter(n => !n.includes("desconhecido"));
  const spNamesND = spNames.filter(n => !n.includes("desconhecido"));
  console.log("");
  console.log("Excluding Desconhecido:");
  console.log("  State patients (non-Desconhecido): " + spNamesND.length);
  console.log("  Missing from DB (non-Desconhecido): " + missPatsND.length);

  // F) THE MATH
  console.log(""); console.log(SEP);
  console.log("  F) THE MATH - Reconciliation");
  console.log(SEP);

  const cmlECIds = new Set(cmlExams.map(e => e.eyerCloudId).filter(Boolean));
  const cmlECMatch = [...cmlECIds].filter(id => eyerCloudExams.some(e => e.id === id || e.eyerCloudId === id));

  console.log("");
  console.log("--- CML / EyerCloud Overlap ---");
  console.log("CML exams total: " + cmlExams.length);
  console.log("CML exams with eyerCloudId: " + cmlWEC);
  console.log("CML eyerCloudIds matching DB EyerCloud exam: " + cmlECMatch.length);
  console.log("CML exams with NO eyerCloudId: " + (cmlExams.length - cmlWEC));

  const uniqECIds = new Set();
  for (const e of eyerCloudExams) uniqECIds.add(e.eyerCloudId || e.id);
  for (const e of cmlExams) { if (e.eyerCloudId) uniqECIds.add(e.eyerCloudId); }
  console.log("");
  console.log("Unique EyerCloud exam IDs in DB (incl CML): " + uniqECIds.size);

  console.log("");
  console.log("--- Target Analysis ---");
  console.log("Target: 456 EyerCloud exams, 451 patients");
  console.log("DB EyerCloud exams (non-cml rows): " + eyerCloudExams.length);
  console.log("DB unique EyerCloud IDs (all rows): " + uniqECIds.size);
  console.log("Gap to 456 (from non-cml): " + (456 - eyerCloudExams.length));
  console.log("Gap to 456 (from unique IDs): " + (456 - uniqECIds.size));

  const uniqNames = new Set(allPatients.filter(p => p.name).map(p => normalize(p.name)));
  console.log("");
  console.log("DB unique patient names: " + uniqNames.size);
  console.log("DB total patient records: " + allPatients.length);
  console.log("Gap to 451 patients: " + (451 - allPatients.length));

  const awr = allExams.filter(e => e.report);
  const cwr = cmlExams.filter(e => e.report);
  const ewr = eyerCloudExams.filter(e => e.report);
  console.log("");
  console.log("--- Reports (critical data) ---");
  console.log("Total exams with reports: " + awr.length);
  console.log("  EyerCloud exams with reports: " + ewr.length);
  console.log("  CML exams with reports: " + cwr.length);

  // SUMMARY
  console.log(""); console.log(SEP);
  console.log("  SUMMARY: ACTIONS NEEDED");
  console.log(SEP);

  console.log("");
  console.log("1. MISSING FROM STATE (not yet downloaded):");
  console.log("   Known in state: " + stateExamIds.length);
  console.log("   Target: 456");
  console.log("   Need to download: " + (456 - stateExamIds.length) + " more exams from EyerCloud");

  console.log("");
  console.log("2. MISSING FROM DB (in state but not imported):");
  console.log("   State exams not in DB: " + notInDb.length);
  console.log("     Named patients: " + missNamed.length);
  console.log("     Desconhecido: " + missDesc.length);

  console.log("");
  console.log("3. CML EXAM RESOLUTION:");
  console.log("   CML duplicates of EyerCloud exams: " + cmlMatch);
  console.log("   CML orphans: " + cmlOrph.length);
  console.log("   Merging CML duplicates would remove " + cmlMatch + " duplicate exam rows");

  console.log("");
  console.log("4. PATIENT GAP:");
  console.log("   Current patients: " + allPatients.length);
  console.log("   Target: 451");
  console.log("   Gap: " + (451 - allPatients.length));
  console.log("   Missing from state (non-Desconhecido): " + missPatsND.length);

  // CROSS-REFERENCE
  console.log(""); console.log(SEP);
  console.log("  DETAILED: Exam ID presence across sources");
  console.log(SEP);

  const allIds = new Set([...stateExamIds, ...mappingExamIds, ...eyerCloudExams.map(e => e.id), ...eyerCloudExams.map(e => e.eyerCloudId).filter(Boolean), ...cmlExams.map(e => e.eyerCloudId).filter(Boolean)]);
  let iAT = 0, oS = 0, oM = 0, oD = 0, sD = 0, sM = 0, mD = 0;
  const mIdSt = new Set(mappingExamIds);
  for (const id of allIds) {
    const a = stSet.has(id), b = mIdSt.has(id), c = allDbId.has(id);
    if (a && b && c) iAT++;
    else if (a && c) sD++;
    else if (a && b) sM++;
    else if (b && c) mD++;
    else if (a) oS++;
    else if (b) oM++;
    else if (c) oD++;
  }
  console.log("Total unique EyerCloud IDs across all sources: " + allIds.size);
  console.log("  In ALL three (state + mapping + DB): " + iAT);
  console.log("  State + DB only: " + sD);
  console.log("  State + Mapping only: " + sM);
  console.log("  Mapping + DB only: " + mD);
  console.log("  Only in state: " + oS);
  console.log("  Only in mapping: " + oM);
  console.log("  Only in DB: " + oD);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
