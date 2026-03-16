/**
 * import_jaci_exams.js - Import new Jaci exams into NeuroApp main DB
 * ===================================================================
 *
 * Imports exams from new_exams_312.json + bytescale_mapping_new_312.json
 * into the main PostgreSQL database, following all data rules.
 *
 * Usage:
 *   node scripts/import_jaci_exams.js              # Preview (default)
 *   node scripts/import_jaci_exams.js --execute     # Apply changes
 *
 * Rules enforced:
 * - All IDs are full 24-char hex (NEVER short IDs)
 * - Image IDs use img-{UUID}.jpg format
 * - Patient dedup by normalized name ONLY (not name+birthDate)
 * - REDFREE images filtered out
 * - Gender normalized to Portuguese (Masculino/Feminino)
 * - Disease data from anamnesis field (not root-level booleans)
 * - Empty strings converted to null
 * - Existing patient data NOT overwritten (only fill nulls)
 * - Exams already in DB are skipped
 * - No external API calls
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// --- File paths ---
const EXAMS_PATH = path.join(__dirname, 'eyercloud_downloader', 'new_exams_312.json');
const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_new_312.json');

// --- Clinic ID mapping ---
const CLINIC_MAP = {
  '695e434f28b781ee6000d862': 'Jaci-SP',
};

// --- Utility functions ---

function normalizeName(name) {
  return (name || '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeGender(gender) {
  if (!gender) return null;
  const g = gender.toLowerCase().trim();
  if (g === 'm' || g === 'male' || g === 'masculino') return 'Masculino';
  if (g === 'f' || g === 'female' || g === 'feminino') return 'Feminino';
  return null;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return new Date(dateStr);
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  if (dateStr.includes('-')) return new Date(dateStr);
  return null;
}

function emptyToNull(val) {
  if (val === '' || val === undefined) return null;
  return val;
}

function buildImageId(uuid) {
  return `img-${uuid}.jpg`;
}

function resolveClinicName(clinicId) {
  return CLINIC_MAP[clinicId] || clinicId;
}

function buildUnderlyingDiseases(exam) {
  const a = exam.anamnesis || {};
  const diseases = {
    diabetes: a.diabetes || false,
    hipiertensaoArterial: a.hypertension || a.hipertensaoArterial || false,
    hipercolesterolemia: a.cholesterol || a.hipercolesterolemia || false,
    tabagismo: a.smoker || a.tabagismo || false,
  };
  // Only return if at least one is true
  if (Object.values(diseases).some(v => v)) return diseases;
  return null;
}

function buildOphthalmicDiseases(exam) {
  const a = exam.anamnesis || {};
  const diseases = {
    catarata: a.catarata || false,
    retinopatia: a.retinopatia || false,
    glaucoma: a.glaucoma || false,
  };
  if (Object.values(diseases).some(v => v)) return diseases;
  return null;
}

function validateExamId(id) {
  if (!id || typeof id !== 'string') return false;
  if (id.length !== 24) return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
}

// ============================================================
// PHASE 0: Load and validate inputs
// ============================================================
function loadAndValidate() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 0: Load and validate inputs');
  console.log('='.repeat(70));

  // Load exam metadata
  if (!fs.existsSync(EXAMS_PATH)) {
    console.error(`❌ Exams file not found: ${EXAMS_PATH}`);
    process.exit(1);
  }
  const exams = JSON.parse(fs.readFileSync(EXAMS_PATH, 'utf8'));
  console.log(`📋 Loaded ${Object.keys(exams).length} exams from new_exams_312.json`);

  // Validate ALL exam IDs are full 24-char hex
  let invalidIds = 0;
  for (const [examId, exam] of Object.entries(exams)) {
    if (!validateExamId(examId)) {
      console.error(`  ❌ INVALID exam ID: "${examId}" (${examId.length} chars) - ${exam.patient_name}`);
      invalidIds++;
    }
    if (exam.patient_id && !validateExamId(exam.patient_id)) {
      console.error(`  ❌ INVALID patient_id: "${exam.patient_id}" - ${exam.patient_name}`);
      invalidIds++;
    }
  }
  if (invalidIds > 0) {
    console.error(`\n❌ Found ${invalidIds} invalid IDs. ABORTING to prevent data corruption.`);
    process.exit(1);
  }
  console.log(`  ✅ All exam IDs are valid 24-char hex`);

  // Load bytescale mapping
  let mapping = {};
  if (fs.existsSync(MAPPING_PATH)) {
    mapping = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf8'));
    console.log(`📋 Loaded ${Object.keys(mapping).length} entries from bytescale mapping`);
  } else {
    console.warn(`⚠️ Bytescale mapping not found: ${MAPPING_PATH}`);
    console.warn(`   Images will NOT be imported. Run upload_new_312.py first.`);
  }

  // Build UUID -> bytescale_url lookup from mapping
  const uuidToUrl = {};
  let totalMappedImages = 0;
  for (const [folderKey, entry] of Object.entries(mapping)) {
    if (entry.images && Array.isArray(entry.images)) {
      for (const img of entry.images) {
        if (img.filename && img.bytescale_url) {
          const uuid = img.filename.replace('.jpg', '').replace('.jpeg', '').replace('.png', '');
          uuidToUrl[uuid] = {
            url: img.bytescale_url,
            type: img.type || 'UNKNOWN',
            laterality: img.laterality || '',
          };
          totalMappedImages++;
        }
      }
    }
  }
  console.log(`  📸 ${totalMappedImages} images with Bytescale URLs`);

  // Count expected images from exam metadata
  let totalExpectedImages = 0;
  let examsWithNoImages = 0;
  for (const exam of Object.values(exams)) {
    const imgCount = (exam.image_details || []).length;
    totalExpectedImages += imgCount;
    if (imgCount === 0) examsWithNoImages++;
  }
  console.log(`  📸 ${totalExpectedImages} expected images from metadata`);
  if (examsWithNoImages > 0) {
    console.log(`  ⚠️ ${examsWithNoImages} exams have 0 images`);
  }

  // Check how many expected images have URLs
  let matchedImages = 0;
  let unmatchedImages = 0;
  for (const exam of Object.values(exams)) {
    for (const img of (exam.image_details || [])) {
      if (uuidToUrl[img.uuid]) matchedImages++;
      else unmatchedImages++;
    }
  }
  console.log(`  ✅ ${matchedImages} images matched to Bytescale URLs`);
  if (unmatchedImages > 0) {
    console.log(`  ⚠️ ${unmatchedImages} images without Bytescale URLs (will be skipped)`);
  }

  return { exams, uuidToUrl };
}

// ============================================================
// PHASE 1: Load DB state
// ============================================================
async function loadDbState() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: Load current database state');
  console.log('='.repeat(70));

  const dbPatients = await prisma.patient.findMany({
    select: { id: true, name: true, cpf: true, birthDate: true, gender: true, underlyingDiseases: true, ophthalmicDiseases: true, phone: true },
  });
  const dbExams = await prisma.exam.findMany({
    select: { id: true, eyerCloudId: true, patientId: true },
  });
  const dbImages = await prisma.examImage.findMany({
    select: { id: true, url: true, examId: true },
  });

  // Build lookups
  const patientByNormName = {};
  for (const p of dbPatients) {
    const norm = normalizeName(p.name);
    patientByNormName[norm] = p;
  }

  const existingEyerCloudIds = new Set();
  for (const e of dbExams) {
    if (e.eyerCloudId) existingEyerCloudIds.add(e.eyerCloudId);
    existingEyerCloudIds.add(e.id); // Exam.id is also often the eyerCloudId
  }

  const imagesByExam = {};
  for (const img of dbImages) {
    if (!imagesByExam[img.examId]) imagesByExam[img.examId] = new Set();
    imagesByExam[img.examId].add(img.url);
  }

  console.log(`  👥 ${dbPatients.length} patients in DB`);
  console.log(`  📋 ${dbExams.length} exams in DB`);
  console.log(`  📸 ${dbImages.length} images in DB`);

  return { patientByNormName, existingEyerCloudIds, imagesByExam, dbPatients, dbExams };
}

// ============================================================
// PHASE 2: Classify exams
// ============================================================
function classifyExams(exams, dbState) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: Classify exams');
  console.log('='.repeat(70));

  const { patientByNormName, existingEyerCloudIds } = dbState;

  const toSkip = [];       // Already in DB
  const toImport = [];     // New exams to import

  for (const [examId, exam] of Object.entries(exams)) {
    if (existingEyerCloudIds.has(examId)) {
      toSkip.push({ examId, exam, reason: 'eyerCloudId already in DB' });
      continue;
    }

    const normName = normalizeName(exam.patient_name);
    const existingPatient = patientByNormName[normName];

    toImport.push({
      examId,
      exam,
      normName,
      existingPatient: existingPatient || null,
      isNewPatient: !existingPatient,
    });
  }

  // Group imports by patient (normalized name)
  const byPatient = {};
  for (const item of toImport) {
    if (!byPatient[item.normName]) {
      byPatient[item.normName] = {
        normName: item.normName,
        existingPatient: item.existingPatient,
        isNewPatient: item.isNewPatient,
        exams: [],
      };
    }
    byPatient[item.normName].exams.push(item);
  }

  // For new patients, sort exams by date to pick the first exam ID as patient ID
  for (const group of Object.values(byPatient)) {
    group.exams.sort((a, b) => {
      const da = a.exam.exam_date || '';
      const db = b.exam.exam_date || '';
      return da.localeCompare(db);
    });
  }

  const newPatients = Object.values(byPatient).filter(g => g.isNewPatient);
  const existingPatients = Object.values(byPatient).filter(g => !g.isNewPatient);
  const totalNewExams = toImport.length;
  const examsForNewPatients = newPatients.reduce((s, g) => s + g.exams.length, 0);
  const examsForExistingPatients = existingPatients.reduce((s, g) => s + g.exams.length, 0);

  console.log(`  ⏭️ Skipping: ${toSkip.length} exams (already in DB)`);
  console.log(`  📋 To import: ${totalNewExams} exams`);
  console.log(`     - ${examsForNewPatients} exams for ${newPatients.length} NEW patients`);
  console.log(`     - ${examsForExistingPatients} exams for ${existingPatients.length} EXISTING patients`);

  if (toSkip.length > 0) {
    console.log(`\n  Skipped exams (first 5):`);
    toSkip.slice(0, 5).forEach(s => console.log(`    - ${s.exam.patient_name} (${s.examId})`));
  }

  // Patients with multiple new exams
  const multiExam = Object.values(byPatient).filter(g => g.exams.length > 1);
  if (multiExam.length > 0) {
    console.log(`\n  Patients with multiple new exams:`);
    multiExam.forEach(g => {
      console.log(`    - ${g.normName}: ${g.exams.length} exams`);
      g.exams.forEach(e => console.log(`      ${e.examId} (${e.exam.exam_date?.substring(0, 10)})`));
    });
  }

  return { toSkip, byPatient };
}

// ============================================================
// PHASE 3: Execute import
// ============================================================
async function executeImport(byPatient, uuidToUrl, execute) {
  console.log('\n' + '='.repeat(70));
  console.log(`PHASE 3: ${execute ? '🔥 EXECUTING' : '👁️ PREVIEW'} import`);
  console.log('='.repeat(70));

  let patientsCreated = 0;
  let patientsUpdated = 0;
  let examsCreated = 0;
  let imagesCreated = 0;
  let imagesSkippedNoUrl = 0;
  let examsWithNoImages = 0;

  const sortedGroups = Object.values(byPatient).sort((a, b) => a.normName.localeCompare(b.normName));

  for (const group of sortedGroups) {
    const { normName, existingPatient, isNewPatient, exams: examItems } = group;
    const firstExam = examItems[0];

    // --- Patient ---
    if (isNewPatient) {
      // New patient: id = first exam's eyerCloudId (full 24-char)
      const patientId = firstExam.examId;
      const exam = firstExam.exam;

      const patientData = {
        id: patientId,
        name: exam.patient_name,
        cpf: emptyToNull(exam.cpf),
        birthDate: parseDate(exam.birthday),
        gender: normalizeGender(exam.gender),
        phone: emptyToNull(exam.telephone),
        underlyingDiseases: buildUnderlyingDiseases(exam),
        ophthalmicDiseases: buildOphthalmicDiseases(exam),
        updatedAt: new Date(),
      };

      console.log(`\n  ➕ NEW patient: ${patientData.name} (ID: ${patientId})`);
      console.log(`     Gender: ${patientData.gender || 'null'}, Birth: ${patientData.birthDate?.toISOString().substring(0, 10) || 'null'}`);

      if (execute) {
        await prisma.patient.create({ data: patientData });
      }
      patientsCreated++;

      // Store for exam creation
      group._patientId = patientId;
    } else {
      // Existing patient: enrich null fields only
      const updates = {};
      const exam = firstExam.exam;

      if (!existingPatient.cpf && emptyToNull(exam.cpf)) updates.cpf = exam.cpf;
      if (!existingPatient.birthDate && parseDate(exam.birthday)) updates.birthDate = parseDate(exam.birthday);
      if (!existingPatient.gender && normalizeGender(exam.gender)) updates.gender = normalizeGender(exam.gender);
      if (!existingPatient.phone && emptyToNull(exam.telephone)) updates.phone = exam.telephone;

      const newUnderlying = buildUnderlyingDiseases(exam);
      if (!existingPatient.underlyingDiseases && newUnderlying) updates.underlyingDiseases = newUnderlying;

      const newOphthalmic = buildOphthalmicDiseases(exam);
      if (!existingPatient.ophthalmicDiseases && newOphthalmic) updates.ophthalmicDiseases = newOphthalmic;

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        console.log(`\n  📝 UPDATE patient: ${existingPatient.name} (ID: ${existingPatient.id})`);
        console.log(`     Filling: ${Object.keys(updates).filter(k => k !== 'updatedAt').join(', ')}`);
        if (execute) {
          await prisma.patient.update({ where: { id: existingPatient.id }, data: updates });
        }
        patientsUpdated++;
      } else {
        console.log(`\n  ✅ EXISTING patient: ${existingPatient.name} (no updates needed)`);
      }

      group._patientId = existingPatient.id;
    }

    // --- Exams ---
    for (const item of examItems) {
      const { examId, exam } = item;
      const patientId = group._patientId;

      const examDate = parseDate(exam.exam_date);
      const location = resolveClinicName(exam.clinic);

      console.log(`     📋 Exam: ${examId} (${examDate?.toISOString().substring(0, 10) || 'null'}, ${location})`);

      // Validate exam ID
      if (!validateExamId(examId)) {
        console.error(`     ❌ SKIPPING: Invalid exam ID "${examId}" (${examId.length} chars)`);
        continue;
      }

      if (execute) {
        await prisma.exam.create({
          data: {
            id: examId,
            eyerCloudId: examId,
            patientId: patientId,
            examDate: examDate || new Date(),
            location: location,
            technicianName: 'EyerCloud Import',
            status: 'pending',
            updatedAt: new Date(),
          },
        });
      }
      examsCreated++;

      // --- Images ---
      const imageDetails = exam.image_details || [];
      if (imageDetails.length === 0) {
        console.log(`     ⚠️ No images for this exam`);
        examsWithNoImages++;
        continue;
      }

      let examImagesCreated = 0;
      for (const imgData of imageDetails) {
        const uuid = imgData.uuid;
        const imgType = imgData.type;

        // Skip REDFREE (shouldn't exist, but safety check)
        if (imgType === 'REDFREE') {
          console.log(`     ⏭️ Skipping REDFREE: ${uuid}`);
          continue;
        }

        // Get Bytescale URL
        const urlData = uuidToUrl[uuid];
        if (!urlData || !urlData.url) {
          imagesSkippedNoUrl++;
          continue;
        }

        const imageId = buildImageId(uuid);

        if (execute) {
          try {
            await prisma.examImage.create({
              data: {
                id: imageId,
                url: urlData.url,
                fileName: `${uuid}.jpg`,
                type: imgType || null,
                examId: examId,
              },
            });
            examImagesCreated++;
          } catch (err) {
            if (err.code === 'P2002') {
              // Unique constraint - image already exists
              console.log(`     ⚠️ Image already exists: ${imageId}`);
            } else {
              console.error(`     ❌ Error creating image: ${err.message}`);
            }
          }
        } else {
          examImagesCreated++;
        }
        imagesCreated++;
      }

      console.log(`     📸 ${examImagesCreated} images`);
    }
  }

  console.log('\n' + '-'.repeat(70));
  console.log('PHASE 3 Summary:');
  console.log(`  👥 Patients created: ${patientsCreated}`);
  console.log(`  👥 Patients updated: ${patientsUpdated}`);
  console.log(`  📋 Exams created: ${examsCreated}`);
  console.log(`  📸 Images created: ${imagesCreated}`);
  console.log(`  ⚠️ Images skipped (no URL): ${imagesSkippedNoUrl}`);
  console.log(`  ⚠️ Exams with 0 images: ${examsWithNoImages}`);

  return { patientsCreated, patientsUpdated, examsCreated, imagesCreated };
}

// ============================================================
// PHASE 4: Verify results
// ============================================================
async function verifyResults(beforeState, stats) {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 4: Verification');
  console.log('='.repeat(70));

  const patients = await prisma.patient.count();
  const exams = await prisma.exam.count();
  const images = await prisma.examImage.count();
  const reports = await prisma.medicalReport.count();

  console.log(`  📊 Database state after import:`);
  console.log(`     Patients: ${beforeState.dbPatients.length} → ${patients} (+${patients - beforeState.dbPatients.length})`);
  console.log(`     Exams:    ${beforeState.dbExams.length} → ${exams} (+${exams - beforeState.dbExams.length})`);
  console.log(`     Images:   ${images}`);
  console.log(`     Reports:  ${reports} (unchanged)`);

  // Verify no short IDs
  const shortIdPatients = await prisma.patient.findMany({
    where: { id: { not: { contains: '-' } } },
    select: { id: true, name: true },
  });
  const badIds = shortIdPatients.filter(p => p.id.length !== 24 && !p.id.startsWith('manual-') && !p.id.startsWith('cml'));
  if (badIds.length > 0) {
    console.error(`  ❌ ALERT: ${badIds.length} patients with non-24-char IDs!`);
    badIds.slice(0, 5).forEach(p => console.error(`     ${p.name}: "${p.id}" (${p.id.length} chars)`));
  } else {
    console.log(`  ✅ All patient IDs are valid`);
  }

  // Verify image ID format
  const badImages = await prisma.examImage.count({
    where: {
      NOT: { id: { startsWith: 'img-' } },
    },
  });
  if (badImages > 0) {
    console.warn(`  ⚠️ ${badImages} images with non-standard ID format (pre-existing)`);
  } else {
    console.log(`  ✅ All image IDs use img-UUID.jpg format`);
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const execute = process.argv.includes('--execute');

  console.log('='.repeat(70));
  console.log('  import_jaci_exams.js - Import new Jaci exams');
  console.log(`  Mode: ${execute ? '🔥 EXECUTE' : '👁️ PREVIEW (use --execute to apply)'}`);
  console.log('='.repeat(70));

  try {
    // Phase 0
    const { exams, uuidToUrl } = loadAndValidate();

    // Phase 1
    const dbState = await loadDbState();

    // Phase 2
    const { toSkip, byPatient } = classifyExams(exams, dbState);

    // Check if anything to do
    const totalToImport = Object.values(byPatient).reduce((s, g) => s + g.exams.length, 0);
    if (totalToImport === 0) {
      console.log('\n✅ Nothing to import - all exams already in DB.');
      return;
    }

    // Phase 3
    const stats = await executeImport(byPatient, uuidToUrl, execute);

    // Phase 4
    if (execute) {
      await verifyResults(dbState, stats);
    } else {
      console.log('\n' + '='.repeat(70));
      console.log('👁️ PREVIEW COMPLETE - No changes were made.');
      console.log('   Run with --execute to apply changes.');
      console.log('   RECOMMENDED: Run "node scripts/db_snapshot.js" first!');
      console.log('='.repeat(70));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
