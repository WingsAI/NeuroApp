#!/usr/bin/env node
/**
 * fix_space_dupes.js
 *
 * Consolidates 3 patients with space-related name duplicates:
 * - ADRIANA APARECIDAVITAL → APARECIDA VITAL
 * - DEBORA TANIA SILVAMACK → SILVA MACK
 * - JULIA SILVA VILANOVA → VILA NOVA
 *
 * Moves exams from the misspelled patient to the correct one,
 * then marks the misspelled patient as duplicate.
 *
 * Usage:
 *   node scripts/fix_space_dupes.js           # Preview
 *   node scripts/fix_space_dupes.js --execute  # Apply
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

function noSpaceNormalize(name) {
    return deepNormalize(name).replace(/\s+/g, '');
}

async function main() {
    console.log(`Mode: ${EXECUTE ? '🔴 EXECUTE' : '🟡 PREVIEW'}\n`);

    const patients = await prisma.stagingPatient.findMany({
        where: { isDuplicate: false },
        include: {
            exams: {
                select: { id: true, eyerCloudId: true, examDate: true },
                orderBy: { examDate: 'asc' },
            },
        },
        orderBy: { createdAt: 'asc' },
    });

    // Group by noSpace
    const byNoSpace = {};
    for (const p of patients) {
        const key = noSpaceNormalize(p.rawName || '');
        if (!key) continue;
        if (!byNoSpace[key]) byNoSpace[key] = [];
        byNoSpace[key].push(p);
    }

    let totalMoved = 0;
    let totalMarked = 0;

    for (const [key, group] of Object.entries(byNoSpace)) {
        if (group.length < 2) continue;
        const deepKeys = new Set(group.map(p => deepNormalize(p.rawName || '')));
        if (deepKeys.size <= 1) continue; // Already handled by previous script

        // Pick the one with MORE words in deepNormalize as "correct" (has proper spaces)
        group.sort((a, b) => {
            const aWords = deepNormalize(a.rawName || '').split(' ').length;
            const bWords = deepNormalize(b.rawName || '').split(' ').length;
            return bWords - aWords; // More words = better spacing
        });

        const primary = group[0];
        const others = group.slice(1);

        const primaryExamIds = new Set(primary.exams.map(e => e.eyerCloudId || e.id));

        console.log(`"${deepNormalize(primary.rawName)}" (correct):`);
        console.log(`  PRIMARY: ${primary.rawName} (${primary.exams.length} exams)`);

        for (const other of others) {
            const examsToMove = other.exams.filter(e => {
                const eid = e.eyerCloudId || e.id;
                return !primaryExamIds.has(eid);
            });

            console.log(`  MERGE:   ${other.rawName} (${other.exams.length} exams, ${examsToMove.length} to move)`);

            if (EXECUTE) {
                for (const exam of examsToMove) {
                    await prisma.stagingExam.update({
                        where: { id: exam.id },
                        data: { patientId: primary.id },
                    });
                    totalMoved++;
                }
                await prisma.stagingPatient.update({
                    where: { id: other.id },
                    data: { isDuplicate: true },
                });
                totalMarked++;
            } else {
                totalMoved += examsToMove.length;
                totalMarked++;
            }
        }
        console.log('');
    }

    console.log('=== SUMMARY ===');
    console.log(`Exams moved: ${totalMoved}`);
    console.log(`Patients marked as duplicate: ${totalMarked}`);

    if (EXECUTE) {
        const active = await prisma.stagingPatient.count({ where: { isDuplicate: false } });
        console.log(`Active patients: ${active}`);
    }

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
