#!/usr/bin/env node
/**
 * consolidate_staging_dupes.js
 *
 * Properly handles duplicate staging patients:
 *
 * For each group of patients with the same deep-normalized name:
 * 1. Pick the "primary" patient (first created)
 * 2. Move all exams from other patients to the primary
 * 3. Mark the empty patients as isDuplicate=true
 *
 * This preserves ALL exams (different consultations) while
 * consolidating them under a single patient record.
 *
 * Usage:
 *   node scripts/consolidate_staging_dupes.js           # Preview
 *   node scripts/consolidate_staging_dupes.js --execute  # Apply
 */

require('dotenv').config();
const { PrismaClient } = require('.prisma/client-staging');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.STAGING_DATABASE_URL } } });

const EXECUTE = process.argv.includes('--execute');

function deepNormalize(name) {
    if (!name) return '';
    return name
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[0-9.,\-\/\\()]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(w => !['DE', 'DA', 'DO', 'DAS', 'DOS', 'DES'].includes(w))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function main() {
    console.log(`Mode: ${EXECUTE ? '🔴 EXECUTE' : '🟡 PREVIEW'}\n`);

    const allPatients = await prisma.stagingPatient.findMany({
        where: { isDuplicate: false },
        include: {
            exams: {
                select: { id: true, eyerCloudId: true, examDate: true },
                orderBy: { examDate: 'asc' },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Group by deep-normalized name
    const byName = {};
    for (const p of allPatients) {
        const key = deepNormalize(p.rawName || p.normalizedName || '');
        if (!key) continue;
        if (!byName[key]) byName[key] = [];
        byName[key].push(p);
    }

    const dupeGroups = Object.entries(byName).filter(([k, v]) => v.length > 1);
    console.log(`Patients: ${allPatients.length}`);
    console.log(`Groups with same name: ${dupeGroups.length}\n`);

    let totalExamsMoved = 0;
    let totalDupesMarked = 0;
    let groupsConsolidated = 0;

    for (const [normName, group] of dupeGroups) {
        const primary = group[0]; // Oldest (first created)
        const others = group.slice(1);

        // Collect primary's exam IDs to check for true duplicates
        const primaryExamIds = new Set(primary.exams.map(e => e.eyerCloudId || e.id));

        let examsToMove = [];
        let truelyDuplicateExams = [];

        for (const other of others) {
            for (const exam of other.exams) {
                const eid = exam.eyerCloudId || exam.id;
                if (primaryExamIds.has(eid)) {
                    truelyDuplicateExams.push(exam);
                } else {
                    examsToMove.push({ exam, fromPatient: other });
                    primaryExamIds.add(eid); // Track to avoid moving same exam twice
                }
            }
        }

        if (examsToMove.length > 0 || others.some(o => o.exams.length === 0)) {
            groupsConsolidated++;
            const dates = [...new Set(
                [...primary.exams, ...examsToMove.map(e => e.exam)]
                    .map(e => e.examDate ? e.examDate.toISOString().split('T')[0] : '?')
            )].sort();

            console.log(`\n"${normName}" — ${group.length} records → consolidating`);
            console.log(`  PRIMARY: ${primary.rawName} (${primary.exams.length} exams)`);
            for (const other of others) {
                const movedFromThis = examsToMove.filter(e => e.fromPatient.id === other.id).length;
                const dupeFromThis = truelyDuplicateExams.filter(e =>
                    other.exams.some(oe => oe.id === e.id)
                ).length;
                console.log(`  MERGE:   ${other.rawName} (${other.exams.length} exams: ${movedFromThis} to move, ${dupeFromThis} true dupes)`);
            }
            console.log(`  Result: ${primary.exams.length + examsToMove.length} exams, dates: ${dates.join(', ')}`);

            if (EXECUTE) {
                // Move exams from others to primary
                for (const { exam } of examsToMove) {
                    await prisma.stagingExam.update({
                        where: { id: exam.id },
                        data: { patientId: primary.id },
                    });
                    totalExamsMoved++;
                }

                // Mark others as duplicate
                for (const other of others) {
                    await prisma.stagingPatient.update({
                        where: { id: other.id },
                        data: { isDuplicate: true },
                    });
                    totalDupesMarked++;
                }
            } else {
                totalExamsMoved += examsToMove.length;
                totalDupesMarked += others.length;
            }
        }
    }

    console.log('\n========== SUMMARY ==========');
    console.log(`Groups consolidated: ${groupsConsolidated}`);
    console.log(`Exams moved to primary patient: ${totalExamsMoved}`);
    console.log(`Patients marked as duplicate: ${totalDupesMarked}`);

    if (EXECUTE) {
        const active = await prisma.stagingPatient.count({ where: { isDuplicate: false } });
        const dupes = await prisma.stagingPatient.count({ where: { isDuplicate: true } });
        console.log(`\nActive patients: ${active}`);
        console.log(`Duplicate patients: ${dupes}`);
    } else {
        console.log(`\nWould result in ~${allPatients.length - totalDupesMarked} active patients`);
        console.log('[PREVIEW] Run with --execute to apply');
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
