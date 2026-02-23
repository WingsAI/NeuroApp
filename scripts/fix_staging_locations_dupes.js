#!/usr/bin/env node
/**
 * fix_staging_locations_dupes.js
 *
 * Fixes two issues in the staging database:
 *
 * 1. LOCATION FIX: All 2,554 staging exams have clinic IDs instead of names:
 *    - 655791265b6e21f0a4ce492f → PD Campos do Jordão (556 exams, Melina)
 *    - 6513154ac9b76b1d9f1524b1 → PD São Paulo (1,998 exams, Mozania)
 *
 * 2. DUPLICATE FIX: Mark duplicate patients (same person appearing twice)
 *    - Uses a smarter normalization that strips numbers/punctuation from names
 *    - Keeps the first patient record, marks others as isDuplicate=true
 *
 * Usage:
 *   node scripts/fix_staging_locations_dupes.js           # Preview
 *   node scripts/fix_staging_locations_dupes.js --execute  # Apply changes
 */

require('dotenv').config();
const { PrismaClient } = require('.prisma/client-staging');
const prisma = new PrismaClient({ datasources: { db: { url: process.env.STAGING_DATABASE_URL } } });

const EXECUTE = process.argv.includes('--execute');

// Clinic ID → display name mapping
const CLINIC_MAP = {
    '655791265b6e21f0a4ce492f': 'PD Campos do Jordão',
    '6513154ac9b76b1d9f1524b1': 'PD São Paulo',
};

/**
 * Normalize a patient name more aggressively:
 * - Uppercase
 * - Strip accents
 * - Remove numbers and punctuation
 * - Remove common prepositions (DE, DA, DO, DAS, DOS)
 * - Collapse whitespace
 */
function deepNormalize(name) {
    if (!name) return '';
    return name
        .toUpperCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
        .replace(/[0-9.,\-\/\\()]/g, '')                    // strip numbers & punctuation
        .replace(/\s+/g, ' ')                                // collapse spaces
        .trim()
        .split(' ')
        .filter(w => !['DE', 'DA', 'DO', 'DAS', 'DOS', 'DES'].includes(w))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function fixLocations() {
    console.log('\n========== PHASE 1: FIX EXAM LOCATIONS ==========\n');

    const locs = await prisma.stagingExam.groupBy({
        by: ['location'],
        _count: true,
    });

    console.log('Current locations:');
    locs.forEach(l => {
        const mapped = CLINIC_MAP[l.location] || '???';
        console.log(`  ${l.location} → ${mapped} (${l._count} exams)`);
    });

    if (EXECUTE) {
        for (const [clinicId, clinicName] of Object.entries(CLINIC_MAP)) {
            const result = await prisma.stagingExam.updateMany({
                where: { location: clinicId },
                data: { location: clinicName },
            });
            console.log(`\n✅ Updated ${result.count} exams: ${clinicId} → ${clinicName}`);
        }
    } else {
        console.log('\n[PREVIEW] Would update all exams with clinic names');
    }
}

async function fixDuplicates() {
    console.log('\n========== PHASE 2: MARK DUPLICATE PATIENTS ==========\n');

    const patients = await prisma.stagingPatient.findMany({
        where: { isDuplicate: false },
        include: {
            exams: { select: { id: true } },
        },
        orderBy: { createdAt: 'asc' },  // Keep the oldest (first imported)
    });

    // Group by deep-normalized name
    const byName = {};
    for (const p of patients) {
        const key = deepNormalize(p.rawName || p.normalizedName || '');
        if (!key) continue;
        byName[key] = byName[key] || [];
        byName[key].push(p);
    }

    const dupeGroups = Object.entries(byName).filter(([k, v]) => v.length > 1);
    console.log(`Total patients (not marked dup): ${patients.length}`);
    console.log(`Groups with duplicates: ${dupeGroups.length}`);

    let totalToMark = 0;
    const idsToMark = [];

    for (const [normName, group] of dupeGroups) {
        // Keep first (oldest), mark rest as duplicate
        const keep = group[0];
        const dupes = group.slice(1);

        console.log(`\n  "${normName}" — ${group.length} records:`);
        console.log(`    KEEP: ${keep.rawName} (${keep.exams.length} exams)`);
        dupes.forEach(d => {
            console.log(`    DUPE: ${d.rawName} (${d.exams.length} exams) → mark as duplicate`);
            idsToMark.push(d.id);
        });

        totalToMark += dupes.length;
    }

    console.log(`\nTotal patients to mark as duplicate: ${totalToMark}`);

    if (EXECUTE && idsToMark.length > 0) {
        const result = await prisma.stagingPatient.updateMany({
            where: { id: { in: idsToMark } },
            data: { isDuplicate: true },
        });
        console.log(`\n✅ Marked ${result.count} patients as duplicate`);
    } else if (!EXECUTE) {
        console.log('\n[PREVIEW] Would mark duplicates');
    }
}

async function main() {
    console.log(`Mode: ${EXECUTE ? '🔴 EXECUTE' : '🟡 PREVIEW'}\n`);

    await fixLocations();
    await fixDuplicates();

    // Final stats
    console.log('\n========== FINAL STATS ==========\n');
    const totalPatients = await prisma.stagingPatient.count({ where: { isDuplicate: false } });
    const totalDupes = await prisma.stagingPatient.count({ where: { isDuplicate: true } });
    const totalExams = await prisma.stagingExam.count();

    const locs = await prisma.stagingExam.groupBy({ by: ['location'], _count: true });
    console.log(`Patients (active): ${totalPatients}`);
    console.log(`Patients (duplicate): ${totalDupes}`);
    console.log(`Exams: ${totalExams}`);
    console.log('Locations:', locs.map(l => `${l.location}: ${l._count}`).join(', '));

    await prisma.$disconnect();
}

main().catch(e => { console.error(e); prisma.$disconnect(); process.exit(1); });
