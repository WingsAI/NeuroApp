/**
 * Database Cleanup & Fix Script
 * ==============================
 *
 * Comprehensive cleanup that addresses three main problems:
 *
 * 1. SHORT PATIENT IDs (8 hex chars) -> Migrate to LONG IDs (24 hex chars)
 *    The correct long ID is found in the patient's exam eyerCloudIds or in the mapping file.
 *
 * 2. DUPLICATE EXAMS per patient -> Consolidate by keeping the richest exam
 *    Short eyerCloudId exams are duplicates of long ones sharing the same 8-char prefix.
 *    Keep the exam with the most images (prefer exams with reports). Move images, delete dupes.
 *
 * 3. EMPTY EXAMS (no images, no report) -> Remove them
 *
 * Usage:
 *   node scripts/cleanup_and_fix.js              # Preview mode (default, read-only)
 *   node scripts/cleanup_and_fix.js --execute     # Execute changes
 *
 * Safety:
 *   - NEVER deletes exams that have MedicalReports
 *   - NEVER touches Bytescale or any external API
 *   - All operations wrapped in transactions where possible
 *   - Detailed logging of every action
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// ============================================================================
// Configuration
// ============================================================================

const MAPPING_PATH = path.join(__dirname, 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
const EXECUTE = process.argv.includes('--execute');

// ============================================================================
// Utilities
// ============================================================================

function loadJSON(filepath) {
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function isShortId(id) {
    return id && /^[a-f0-9]{8}$/i.test(id);
}

function isLongId(id) {
    return id && /^[a-f0-9]{24}$/i.test(id);
}

function shortPrefix(id) {
    return id ? id.substring(0, 8).toLowerCase() : null;
}

function separator(char = '=', length = 78) {
    return char.repeat(length);
}

function sectionHeader(title) {
    console.log('\n' + separator());
    console.log(`  ${title}`);
    console.log(separator());
}

function subsectionHeader(title) {
    console.log('\n' + separator('-', 60));
    console.log(`  ${title}`);
    console.log(separator('-', 60));
}

// ============================================================================
// Phase 0: Database state analysis
// ============================================================================

async function analyzeCurrentState() {
    sectionHeader('PHASE 0: Current Database State');

    const patientCount = await prisma.patient.count();
    const examCount = await prisma.exam.count();
    const imageCount = await prisma.examImage.count();
    const reportCount = await prisma.medicalReport.count();
    const referralCount = await prisma.patientReferral.count();

    console.log(`  Patients:      ${patientCount}`);
    console.log(`  Exams:         ${examCount}`);
    console.log(`  Images:        ${imageCount}`);
    console.log(`  Reports:       ${reportCount}`);
    console.log(`  Referrals:     ${referralCount}`);

    // Analyze patient ID lengths
    const patients = await prisma.patient.findMany({ select: { id: true, name: true } });
    const shortIdPatients = patients.filter(p => isShortId(p.id));
    const longIdPatients = patients.filter(p => isLongId(p.id));
    const otherIdPatients = patients.filter(p => !isShortId(p.id) && !isLongId(p.id));

    console.log(`\n  Patient ID breakdown:`);
    console.log(`    Short IDs (8 chars):   ${shortIdPatients.length}`);
    console.log(`    Long IDs (24 chars):   ${longIdPatients.length}`);
    console.log(`    Other IDs:             ${otherIdPatients.length}`);

    if (otherIdPatients.length > 0) {
        console.log(`    Other ID examples:`);
        otherIdPatients.slice(0, 5).forEach(p => {
            console.log(`      ${p.id} (${p.id.length} chars) - ${p.name}`);
        });
    }

    // Analyze exam eyerCloudId lengths
    const exams = await prisma.exam.findMany({ select: { id: true, eyerCloudId: true } });
    const shortEyerExams = exams.filter(e => e.eyerCloudId && isShortId(e.eyerCloudId));
    const longEyerExams = exams.filter(e => e.eyerCloudId && isLongId(e.eyerCloudId));
    const nullEyerExams = exams.filter(e => !e.eyerCloudId);

    console.log(`\n  Exam eyerCloudId breakdown:`);
    console.log(`    Short (8 chars):       ${shortEyerExams.length}`);
    console.log(`    Long (24 chars):       ${longEyerExams.length}`);
    console.log(`    Null/empty:            ${nullEyerExams.length}`);

    // Exams with no images
    const examsWithImages = await prisma.exam.findMany({
        include: { images: { select: { id: true } }, report: { select: { id: true } } }
    });
    const emptyExams = examsWithImages.filter(e => e.images.length === 0);
    const emptyNoReport = emptyExams.filter(e => !e.report);
    const emptyWithReport = emptyExams.filter(e => e.report);

    console.log(`\n  Empty exams (no images):`);
    console.log(`    Total:                 ${emptyExams.length}`);
    console.log(`    Without report:        ${emptyNoReport.length} (safe to remove)`);
    console.log(`    With report:           ${emptyWithReport.length} (KEEP - has report)`);

    return {
        patientCount, examCount, imageCount, reportCount,
        shortIdPatients, longIdPatients, otherIdPatients,
        shortEyerExams, longEyerExams
    };
}

// ============================================================================
// Phase 1: Migrate short patient IDs to long IDs
// ============================================================================

async function migrateShortPatientIds() {
    sectionHeader('PHASE 1: Migrate Short Patient IDs to Long IDs');

    // Load mapping file for fallback ID resolution
    const mapping = loadJSON(MAPPING_PATH);
    if (!mapping) {
        console.log('  WARNING: Mapping file not found. Will rely on exam eyerCloudIds only.');
    } else {
        console.log(`  Mapping file loaded: ${Object.keys(mapping).length} entries`);
    }

    // Build a lookup from mapping: shortPrefix -> longId
    const mappingLookup = {};
    if (mapping) {
        for (const [key, entry] of Object.entries(mapping)) {
            const examId = entry.exam_id;
            if (examId && isLongId(examId)) {
                const prefix = shortPrefix(examId);
                if (!mappingLookup[prefix]) {
                    mappingLookup[prefix] = [];
                }
                mappingLookup[prefix].push({
                    longId: examId,
                    patientName: entry.patient_name,
                    key: key
                });
            }
        }
    }

    // Fetch all patients with their exams
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: { select: { id: true } },
                    report: { select: { id: true } },
                    referral: { select: { id: true } }
                }
            }
        }
    });

    const shortIdPatients = patients.filter(p => isShortId(p.id));
    console.log(`\n  Found ${shortIdPatients.length} patients with short IDs to migrate.`);

    const migrationPlan = [];
    const noLongIdFound = [];

    for (const patient of shortIdPatients) {
        const currentShortId = patient.id.toLowerCase();

        // Strategy 1: Find long eyerCloudId from this patient's own exams
        let longId = null;
        for (const exam of patient.exams) {
            if (exam.eyerCloudId && isLongId(exam.eyerCloudId) && shortPrefix(exam.eyerCloudId) === currentShortId) {
                longId = exam.eyerCloudId;
                break;
            }
        }

        // Strategy 2: Look in the mapping file
        if (!longId && mappingLookup[currentShortId]) {
            const candidates = mappingLookup[currentShortId];
            // Prefer the one whose patient name matches
            const nameMatch = candidates.find(c =>
                c.patientName && c.patientName.trim().toUpperCase() === patient.name.trim().toUpperCase()
            );
            if (nameMatch) {
                longId = nameMatch.longId;
            } else if (candidates.length === 1) {
                // Only one candidate, use it
                longId = candidates[0].longId;
            }
        }

        // Strategy 3: If the patient has any exam whose id (not eyerCloudId) is 24 chars and starts with the short prefix
        if (!longId) {
            for (const exam of patient.exams) {
                if (isLongId(exam.id) && shortPrefix(exam.id) === currentShortId) {
                    longId = exam.id;
                    break;
                }
            }
        }

        if (longId) {
            // Check if a patient with this long ID already exists
            const existingTarget = patients.find(p => p.id === longId);

            migrationPlan.push({
                patient,
                currentId: patient.id,
                newId: longId,
                examCount: patient.exams.length,
                imageCount: patient.exams.reduce((sum, e) => sum + e.images.length, 0),
                hasReports: patient.exams.some(e => e.report),
                hasReferrals: patient.exams.some(e => e.referral),
                conflictsWithExisting: existingTarget ? existingTarget.id : null
            });
        } else {
            noLongIdFound.push({
                id: patient.id,
                name: patient.name,
                examCount: patient.exams.length,
                examIds: patient.exams.map(e => e.eyerCloudId || e.id)
            });
        }
    }

    // Report migration plan
    subsectionHeader(`Migration Plan: ${migrationPlan.length} patients to migrate`);

    for (const plan of migrationPlan) {
        const conflict = plan.conflictsWithExisting ? ' [CONFLICT - target ID exists]' : '';
        const reports = plan.hasReports ? ' [HAS REPORTS]' : '';
        console.log(`  ${plan.patient.name}`);
        console.log(`    ${plan.currentId} -> ${plan.newId}${conflict}${reports}`);
        console.log(`    Exams: ${plan.examCount}, Images: ${plan.imageCount}`);
    }

    if (noLongIdFound.length > 0) {
        subsectionHeader(`No Long ID Found: ${noLongIdFound.length} patients (will be skipped)`);
        for (const p of noLongIdFound) {
            console.log(`  ${p.name} (${p.id}) - ${p.examCount} exams`);
            console.log(`    Exam IDs: ${p.examIds.join(', ')}`);
        }
    }

    // Execute migrations
    if (!EXECUTE) {
        console.log(`\n  [PREVIEW] Would migrate ${migrationPlan.length} patients.`);
        return { migrated: 0, skipped: noLongIdFound.length, planned: migrationPlan.length };
    }

    let migrated = 0;
    let errors = 0;

    for (const plan of migrationPlan) {
        try {
            await prisma.$transaction(async (tx) => {
                // Check if a patient with the new long ID already exists
                const existingTarget = await tx.patient.findUnique({
                    where: { id: plan.newId },
                    include: { exams: { select: { id: true } } }
                });

                if (existingTarget) {
                    // Merge: move all exams from old patient to existing long-ID patient
                    console.log(`  MERGE: ${plan.currentId} into existing ${plan.newId}`);

                    // Copy metadata if the existing target is missing it
                    const updateData = {};
                    if (!existingTarget.cpf && plan.patient.cpf) updateData.cpf = plan.patient.cpf;
                    if (!existingTarget.birthDate && plan.patient.birthDate) updateData.birthDate = plan.patient.birthDate;
                    if (!existingTarget.gender && plan.patient.gender) updateData.gender = plan.patient.gender;
                    if (!existingTarget.education && plan.patient.education) updateData.education = plan.patient.education;
                    if (!existingTarget.ethnicity && plan.patient.ethnicity) updateData.ethnicity = plan.patient.ethnicity;
                    if (!existingTarget.phone && plan.patient.phone) updateData.phone = plan.patient.phone;
                    if (!existingTarget.occupation && plan.patient.occupation) updateData.occupation = plan.patient.occupation;
                    if (!existingTarget.underlyingDiseases && plan.patient.underlyingDiseases) {
                        updateData.underlyingDiseases = plan.patient.underlyingDiseases;
                    }
                    if (!existingTarget.ophthalmicDiseases && plan.patient.ophthalmicDiseases) {
                        updateData.ophthalmicDiseases = plan.patient.ophthalmicDiseases;
                    }

                    if (Object.keys(updateData).length > 0) {
                        updateData.updatedAt = new Date();
                        await tx.patient.update({ where: { id: plan.newId }, data: updateData });
                    }

                    // Move all exams to the target patient
                    await tx.exam.updateMany({
                        where: { patientId: plan.currentId },
                        data: { patientId: plan.newId }
                    });

                    // Delete old short-ID patient (now has no exams due to cascade)
                    await tx.patient.delete({ where: { id: plan.currentId } });

                } else {
                    // Create new patient with long ID, copy all data
                    await tx.patient.create({
                        data: {
                            id: plan.newId,
                            name: plan.patient.name,
                            cpf: plan.patient.cpf,
                            birthDate: plan.patient.birthDate,
                            gender: plan.patient.gender,
                            education: plan.patient.education,
                            ethnicity: plan.patient.ethnicity,
                            occupation: plan.patient.occupation,
                            phone: plan.patient.phone,
                            ophthalmicDiseases: plan.patient.ophthalmicDiseases || undefined,
                            underlyingDiseases: plan.patient.underlyingDiseases || undefined,
                            createdAt: plan.patient.createdAt,
                            updatedAt: new Date(),
                        }
                    });

                    // Move all exams to new patient
                    await tx.exam.updateMany({
                        where: { patientId: plan.currentId },
                        data: { patientId: plan.newId }
                    });

                    // Delete old short-ID patient
                    await tx.patient.delete({ where: { id: plan.currentId } });
                }
            }, { timeout: 60000 });

            console.log(`  OK: ${plan.patient.name} | ${plan.currentId} -> ${plan.newId}`);
            migrated++;

        } catch (err) {
            console.error(`  ERROR: ${plan.patient.name} | ${plan.currentId} -> ${plan.newId}`);
            console.error(`    ${err.message}`);
            errors++;
        }
    }

    console.log(`\n  Migration complete: ${migrated} migrated, ${errors} errors, ${noLongIdFound.length} skipped.`);
    return { migrated, errors, skipped: noLongIdFound.length, planned: migrationPlan.length };
}

// ============================================================================
// Phase 2: Consolidate duplicate exams per patient
// ============================================================================

async function consolidateDuplicateExams() {
    sectionHeader('PHASE 2: Consolidate Duplicate Exams');

    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: true,
                    report: { select: { id: true, doctorName: true } },
                    referral: { select: { id: true } }
                }
            }
        }
    });

    let totalGroups = 0;
    let totalExamsToRemove = 0;
    let totalImagesToMove = 0;
    let totalDuplicateImagesToDelete = 0;
    let patientsAffected = 0;

    const consolidationPlan = [];

    for (const patient of patients) {
        if (patient.exams.length <= 1) continue;

        // Group exams by their short prefix (first 8 chars of eyerCloudId)
        const examGroups = {};
        const ungrouped = [];

        for (const exam of patient.exams) {
            const eyerId = exam.eyerCloudId || exam.id;
            const prefix = shortPrefix(eyerId);

            if (prefix) {
                if (!examGroups[prefix]) examGroups[prefix] = [];
                examGroups[prefix].push(exam);
            } else {
                ungrouped.push(exam);
            }
        }

        // Process groups with duplicates (more than one exam sharing the same prefix)
        for (const [prefix, group] of Object.entries(examGroups)) {
            if (group.length <= 1) continue;

            totalGroups++;

            // Scoring: decide which exam to keep
            // Priority: 1) has report, 2) most images, 3) long eyerCloudId, 4) oldest creation
            const scored = group.map(exam => {
                let score = 0;
                if (exam.report) score += 10000;           // Report is critical
                if (exam.referral) score += 5000;          // Referral is important
                score += exam.images.length * 10;          // More images = better
                if (isLongId(exam.eyerCloudId)) score += 100; // Prefer long ID
                return { exam, score };
            });

            scored.sort((a, b) => b.score - a.score);

            const keeper = scored[0].exam;
            const duplicates = scored.slice(1).map(s => s.exam);

            // Check for images in duplicates that are NOT in the keeper (by URL)
            const keeperUrls = new Set(keeper.images.map(img => img.url));

            const imagesToMove = [];
            const imagesToDelete = [];

            for (const dup of duplicates) {
                for (const img of dup.images) {
                    if (!keeperUrls.has(img.url)) {
                        imagesToMove.push({ imageId: img.id, fromExamId: dup.id, toExamId: keeper.id });
                        keeperUrls.add(img.url); // Prevent adding the same URL twice
                    } else {
                        imagesToDelete.push({ imageId: img.id, examId: dup.id });
                    }
                }
            }

            // Safety: never remove an exam that has a report
            const safeToRemove = duplicates.filter(d => !d.report && !d.referral);
            const unsafeToRemove = duplicates.filter(d => d.report || d.referral);

            if (safeToRemove.length > 0 || imagesToMove.length > 0) {
                patientsAffected++;
                totalExamsToRemove += safeToRemove.length;
                totalImagesToMove += imagesToMove.length;
                totalDuplicateImagesToDelete += imagesToDelete.length;

                consolidationPlan.push({
                    patient,
                    prefix,
                    keeper,
                    safeToRemove,
                    unsafeToRemove,
                    imagesToMove,
                    imagesToDelete
                });
            }
        }
    }

    // Report
    subsectionHeader(`Consolidation Plan Summary`);
    console.log(`  Patients affected:          ${patientsAffected}`);
    console.log(`  Duplicate groups found:     ${totalGroups}`);
    console.log(`  Exams to remove:            ${totalExamsToRemove}`);
    console.log(`  Images to move (unique):    ${totalImagesToMove}`);
    console.log(`  Duplicate images to delete: ${totalDuplicateImagesToDelete}`);

    // Detailed plan
    if (consolidationPlan.length > 0) {
        subsectionHeader('Detailed Consolidation Plan');

        for (const plan of consolidationPlan) {
            console.log(`\n  Patient: ${plan.patient.name} (${plan.patient.id})`);
            console.log(`    Prefix group: ${plan.prefix}`);
            console.log(`    KEEP exam:   ${plan.keeper.id} (eyerCloudId: ${plan.keeper.eyerCloudId})`);
            console.log(`      Images: ${plan.keeper.images.length}, Report: ${plan.keeper.report ? 'YES' : 'no'}`);

            for (const dup of plan.safeToRemove) {
                console.log(`    REMOVE exam: ${dup.id} (eyerCloudId: ${dup.eyerCloudId})`);
                console.log(`      Images: ${dup.images.length}, Report: no`);
            }

            for (const unsafe of plan.unsafeToRemove) {
                console.log(`    SKIP exam (has report/referral): ${unsafe.id}`);
            }

            if (plan.imagesToMove.length > 0) {
                console.log(`    Move ${plan.imagesToMove.length} unique images to keeper`);
            }
            if (plan.imagesToDelete.length > 0) {
                console.log(`    Delete ${plan.imagesToDelete.length} duplicate images`);
            }
        }
    }

    // Execute consolidation
    if (!EXECUTE) {
        console.log(`\n  [PREVIEW] Would consolidate ${totalGroups} groups across ${patientsAffected} patients.`);
        return {
            groupsProcessed: 0, examsRemoved: 0,
            imagesMoved: 0, duplicateImagesDeleted: 0,
            planned: consolidationPlan.length
        };
    }

    let groupsProcessed = 0;
    let examsRemoved = 0;
    let imagesMoved = 0;
    let duplicateImagesDeleted = 0;
    let consolidationErrors = 0;

    for (const plan of consolidationPlan) {
        try {
            await prisma.$transaction(async (tx) => {
                // Step 1: Move unique images from duplicates to the keeper
                for (const move of plan.imagesToMove) {
                    await tx.examImage.update({
                        where: { id: move.imageId },
                        data: { examId: move.toExamId }
                    });
                    imagesMoved++;
                }

                // Step 2: Delete duplicate images (URLs already present in keeper)
                for (const del of plan.imagesToDelete) {
                    await tx.examImage.delete({ where: { id: del.imageId } });
                    duplicateImagesDeleted++;
                }

                // Step 3: Delete the now-empty duplicate exams (safe ones only)
                for (const dup of plan.safeToRemove) {
                    await tx.exam.delete({ where: { id: dup.id } });
                    examsRemoved++;
                }

                // Step 4: Ensure keeper has the long eyerCloudId
                if (!isLongId(plan.keeper.eyerCloudId)) {
                    // Check if any of the removed duplicates had the long ID
                    const longFromDupes = plan.safeToRemove.find(d => isLongId(d.eyerCloudId));
                    if (longFromDupes) {
                        await tx.exam.update({
                            where: { id: plan.keeper.id },
                            data: { eyerCloudId: longFromDupes.eyerCloudId }
                        });
                    }
                }
            }, { timeout: 60000 });

            groupsProcessed++;
            console.log(`  OK: ${plan.patient.name} | prefix ${plan.prefix} | kept ${plan.keeper.id}`);

        } catch (err) {
            console.error(`  ERROR: ${plan.patient.name} | prefix ${plan.prefix}`);
            console.error(`    ${err.message}`);
            consolidationErrors++;
        }
    }

    console.log(`\n  Consolidation complete: ${groupsProcessed} groups, ${examsRemoved} exams removed,`);
    console.log(`    ${imagesMoved} images moved, ${duplicateImagesDeleted} duplicate images deleted,`);
    console.log(`    ${consolidationErrors} errors.`);

    return { groupsProcessed, examsRemoved, imagesMoved, duplicateImagesDeleted, errors: consolidationErrors };
}

// ============================================================================
// Phase 3: Clean up empty exams (no images, no report)
// ============================================================================

async function cleanupEmptyExams() {
    sectionHeader('PHASE 3: Clean Up Empty Exams');

    const exams = await prisma.exam.findMany({
        include: {
            images: { select: { id: true } },
            report: { select: { id: true } },
            referral: { select: { id: true } },
            patient: { select: { id: true, name: true } }
        }
    });

    const emptyExams = exams.filter(e => e.images.length === 0);
    const safeToDelete = emptyExams.filter(e => !e.report && !e.referral);
    const protectedExams = emptyExams.filter(e => e.report || e.referral);

    console.log(`  Total exams:           ${exams.length}`);
    console.log(`  Empty exams:           ${emptyExams.length}`);
    console.log(`  Safe to delete:        ${safeToDelete.length}`);
    console.log(`  Protected (report/ref): ${protectedExams.length}`);

    if (safeToDelete.length > 0) {
        subsectionHeader('Empty Exams to Delete');
        for (const exam of safeToDelete) {
            console.log(`  ${exam.patient.name.padEnd(35)} | Exam: ${exam.id} | EyerID: ${exam.eyerCloudId || 'null'}`);
        }
    }

    if (protectedExams.length > 0) {
        subsectionHeader('Protected Empty Exams (KEPT)');
        for (const exam of protectedExams) {
            const reason = exam.report ? 'has report' : 'has referral';
            console.log(`  ${exam.patient.name.padEnd(35)} | Exam: ${exam.id} | Reason: ${reason}`);
        }
    }

    if (!EXECUTE) {
        console.log(`\n  [PREVIEW] Would delete ${safeToDelete.length} empty exams.`);
        return { deleted: 0, protected: protectedExams.length, planned: safeToDelete.length };
    }

    let deleted = 0;
    let deleteErrors = 0;

    for (const exam of safeToDelete) {
        try {
            await prisma.exam.delete({ where: { id: exam.id } });
            deleted++;
        } catch (err) {
            console.error(`  ERROR deleting exam ${exam.id}: ${err.message}`);
            deleteErrors++;
        }
    }

    console.log(`\n  Cleanup complete: ${deleted} exams deleted, ${deleteErrors} errors.`);
    return { deleted, protected: protectedExams.length, errors: deleteErrors };
}

// ============================================================================
// Phase 4: Normalize exam eyerCloudIds (short -> long where possible)
// ============================================================================

async function normalizeExamEyerCloudIds() {
    sectionHeader('PHASE 4: Normalize Exam eyerCloudIds');

    const mapping = loadJSON(MAPPING_PATH);

    // Build prefix -> longId lookup from mapping
    const longIdLookup = {};
    if (mapping) {
        for (const entry of Object.values(mapping)) {
            if (entry.exam_id && isLongId(entry.exam_id)) {
                const prefix = shortPrefix(entry.exam_id);
                longIdLookup[prefix] = entry.exam_id;
            }
        }
    }

    const exams = await prisma.exam.findMany({
        select: { id: true, eyerCloudId: true, patientId: true }
    });

    const shortExams = exams.filter(e => e.eyerCloudId && isShortId(e.eyerCloudId));
    console.log(`  Exams with short eyerCloudId: ${shortExams.length}`);

    const updatePlan = [];

    for (const exam of shortExams) {
        const prefix = shortPrefix(exam.eyerCloudId);

        // Look for the long ID in the mapping
        const longId = longIdLookup[prefix] || null;

        if (longId) {
            updatePlan.push({ examId: exam.id, currentEyerId: exam.eyerCloudId, newEyerId: longId });
        }
    }

    console.log(`  Can update to long ID: ${updatePlan.length}`);
    console.log(`  No long ID available:  ${shortExams.length - updatePlan.length}`);

    if (updatePlan.length > 0 && updatePlan.length <= 30) {
        for (const plan of updatePlan) {
            console.log(`    ${plan.examId}: ${plan.currentEyerId} -> ${plan.newEyerId}`);
        }
    }

    if (!EXECUTE) {
        console.log(`\n  [PREVIEW] Would update ${updatePlan.length} exam eyerCloudIds.`);
        return { updated: 0, planned: updatePlan.length };
    }

    let updated = 0;
    for (const plan of updatePlan) {
        try {
            await prisma.exam.update({
                where: { id: plan.examId },
                data: { eyerCloudId: plan.newEyerId }
            });
            updated++;
        } catch (err) {
            console.error(`  ERROR updating exam ${plan.examId}: ${err.message}`);
        }
    }

    console.log(`\n  Updated ${updated} exam eyerCloudIds.`);
    return { updated };
}

// ============================================================================
// Phase 5: Final verification
// ============================================================================

async function finalVerification() {
    sectionHeader('PHASE 5: Final Verification');

    const patientCount = await prisma.patient.count();
    const examCount = await prisma.exam.count();
    const imageCount = await prisma.examImage.count();
    const reportCount = await prisma.medicalReport.count();
    const referralCount = await prisma.patientReferral.count();

    console.log(`  Patients:      ${patientCount}`);
    console.log(`  Exams:         ${examCount}`);
    console.log(`  Images:        ${imageCount}`);
    console.log(`  Reports:       ${reportCount}`);
    console.log(`  Referrals:     ${referralCount}`);

    // Check remaining short IDs
    const patients = await prisma.patient.findMany({ select: { id: true } });
    const remainingShort = patients.filter(p => isShortId(p.id));
    console.log(`\n  Remaining short patient IDs: ${remainingShort.length}`);

    // Check remaining short eyerCloudIds
    const exams = await prisma.exam.findMany({ select: { eyerCloudId: true } });
    const remainingShortEyer = exams.filter(e => e.eyerCloudId && isShortId(e.eyerCloudId));
    console.log(`  Remaining short eyerCloudIds: ${remainingShortEyer.length}`);

    // Check remaining empty exams
    const emptyExams = await prisma.exam.findMany({
        where: { images: { none: {} } },
        include: { report: { select: { id: true } } }
    });
    const emptyNoReport = emptyExams.filter(e => !e.report);
    console.log(`  Remaining empty exams (no images): ${emptyExams.length}`);
    console.log(`  Remaining empty exams without report: ${emptyNoReport.length}`);

    // Orphan check: exams referencing non-existent patients
    const allPatientIds = new Set(patients.map(p => p.id));
    const allExams = await prisma.exam.findMany({ select: { id: true, patientId: true } });
    const orphanExams = allExams.filter(e => !allPatientIds.has(e.patientId));
    console.log(`  Orphan exams (bad patientId): ${orphanExams.length}`);

    // Report integrity
    const reports = await prisma.medicalReport.findMany({ select: { id: true, examId: true } });
    const allExamIds = new Set(allExams.map(e => e.id));
    const orphanReports = reports.filter(r => !allExamIds.has(r.examId));
    console.log(`  Orphan reports (bad examId): ${orphanReports.length}`);

    if (remainingShort.length === 0 && remainingShortEyer.length === 0 && emptyNoReport.length === 0 && orphanExams.length === 0) {
        console.log('\n  Database is clean!');
    } else {
        console.log('\n  Some issues remain. Consider running the script again or investigating manually.');
    }

    return { patientCount, examCount, imageCount, reportCount, referralCount };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log(separator('='));
    console.log('  NeuroApp Database Cleanup & Fix Script');
    console.log(separator('='));
    console.log(`  Mode: ${EXECUTE ? 'EXECUTE (changes WILL be applied)' : 'PREVIEW (read-only, no changes)'}`);
    console.log(`  Date: ${new Date().toISOString()}`);

    if (!EXECUTE) {
        console.log('\n  To apply changes, run with: node scripts/cleanup_and_fix.js --execute');
    }

    // Phase 0: Analyze
    const initialState = await analyzeCurrentState();

    // Phase 1: Migrate short patient IDs
    const migrationResult = await migrateShortPatientIds();

    // Phase 2: Consolidate duplicate exams
    const consolidationResult = await consolidateDuplicateExams();

    // Phase 3: Clean up empty exams
    const cleanupResult = await cleanupEmptyExams();

    // Phase 4: Normalize eyerCloudIds
    const normalizeResult = await normalizeExamEyerCloudIds();

    // Phase 5: Final verification
    const finalState = await finalVerification();

    // Summary
    sectionHeader('SUMMARY');

    if (EXECUTE) {
        console.log('  Changes applied:');
        console.log(`    Patients migrated (short->long ID): ${migrationResult.migrated || 0}`);
        console.log(`    Patients skipped (no long ID):      ${migrationResult.skipped || 0}`);
        console.log(`    Duplicate exam groups consolidated:  ${consolidationResult.groupsProcessed || 0}`);
        console.log(`    Duplicate exams removed:             ${consolidationResult.examsRemoved || 0}`);
        console.log(`    Images moved to keeper exams:        ${consolidationResult.imagesMoved || 0}`);
        console.log(`    Duplicate images deleted:            ${consolidationResult.duplicateImagesDeleted || 0}`);
        console.log(`    Empty exams deleted:                 ${cleanupResult.deleted || 0}`);
        console.log(`    Exam eyerCloudIds normalized:        ${normalizeResult.updated || 0}`);

        console.log(`\n  Before -> After:`);
        console.log(`    Patients: ${initialState.patientCount} -> ${finalState.patientCount}`);
        console.log(`    Exams:    ${initialState.examCount} -> ${finalState.examCount}`);
        console.log(`    Images:   ${initialState.imageCount} -> ${finalState.imageCount}`);
        console.log(`    Reports:  ${initialState.reportCount} -> ${finalState.reportCount} (should be unchanged)`);
    } else {
        console.log('  Planned changes (use --execute to apply):');
        console.log(`    Patients to migrate:                ${migrationResult.planned || 0}`);
        console.log(`    Patients skipped (no long ID):      ${migrationResult.skipped || 0}`);
        console.log(`    Duplicate groups to consolidate:    ${consolidationResult.planned || 0}`);
        console.log(`    Empty exams to delete:              ${cleanupResult.planned || 0}`);
        console.log(`    Exam eyerCloudIds to normalize:     ${normalizeResult.planned || 0}`);
    }

    console.log('\n' + separator('='));
}

main()
    .catch((err) => {
        console.error('\nFATAL ERROR:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
