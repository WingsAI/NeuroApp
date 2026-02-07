const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    // 1. EMPTY EXAMS WITH REPORTS
    console.log('=== EMPTY EXAMS WITH REPORTS ===');
    const emptyExams = await prisma.exam.findMany({
        where: { images: { none: {} } },
        include: {
            patient: { select: { id: true, name: true } },
            report: { select: { id: true, doctorName: true, completedAt: true } }
        }
    });

    for (const e of emptyExams) {
        console.log(`  Patient: ${e.patient.name}`);
        console.log(`    ExamID: ${e.id}`);
        console.log(`    eyerCloudId: ${e.eyerCloudId}`);
        console.log(`    Location: ${e.location}`);
        console.log(`    Report: ${e.report ? `YES by ${e.report.doctorName} at ${e.report.completedAt}` : 'NO'}`);
        console.log('');
    }

    // 2. PATIENTS WITH MOST IMAGES (top 20)
    console.log('\n=== TOP 20 PATIENTS BY IMAGE COUNT ===');
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: {
                    images: { select: { id: true, url: true, type: true, fileName: true } }
                }
            }
        }
    });

    const patientImageCounts = patients.map(p => {
        const allImages = p.exams.flatMap(e => e.images);
        const urls = allImages.map(i => i.url);
        const uniqueUrls = new Set(urls);
        const types = {};
        allImages.forEach(i => { types[i.type || 'null'] = (types[i.type || 'null'] || 0) + 1; });
        return {
            name: p.name,
            id: p.id,
            exams: p.exams.length,
            totalImages: allImages.length,
            uniqueUrls: uniqueUrls.size,
            duplicateUrls: allImages.length - uniqueUrls.size,
            types
        };
    }).sort((a, b) => b.totalImages - a.totalImages);

    for (const p of patientImageCounts.slice(0, 20)) {
        const dupNote = p.duplicateUrls > 0 ? ` [${p.duplicateUrls} DUPLICATE URLs!]` : '';
        console.log(`  ${p.name.padEnd(45)} | Imgs: ${p.totalImages} | Unique: ${p.uniqueUrls}${dupNote} | Types: ${JSON.stringify(p.types)} | Exams: ${p.exams}`);
    }

    // 3. TOTAL DUPLICATE IMAGE URLS across ALL patients
    console.log('\n=== GLOBAL IMAGE DUPLICATE ANALYSIS ===');
    const allImages = await prisma.examImage.findMany({ select: { id: true, url: true, examId: true } });
    const urlMap = {};
    allImages.forEach(img => {
        if (!urlMap[img.url]) urlMap[img.url] = [];
        urlMap[img.url].push(img);
    });

    const duplicateGroups = Object.entries(urlMap).filter(([url, imgs]) => imgs.length > 1);
    const totalDuplicateImages = duplicateGroups.reduce((sum, [url, imgs]) => sum + imgs.length - 1, 0);

    console.log(`  Total images: ${allImages.length}`);
    console.log(`  Unique URLs: ${Object.keys(urlMap).length}`);
    console.log(`  Duplicate URL groups: ${duplicateGroups.length}`);
    console.log(`  Total duplicate images (removable): ${totalDuplicateImages}`);

    if (duplicateGroups.length > 0) {
        console.log('\n  Sample duplicates (first 5):');
        for (const [url, imgs] of duplicateGroups.slice(0, 5)) {
            console.log(`    URL: ...${url.slice(-40)} -> ${imgs.length} copies across exams: ${imgs.map(i => i.examId).join(', ')}`);
        }
    }

    // 4. IMAGE TYPE DISTRIBUTION
    console.log('\n=== GLOBAL IMAGE TYPE DISTRIBUTION ===');
    const typeCount = {};
    const allImgsWithType = await prisma.examImage.findMany({ select: { type: true } });
    allImgsWithType.forEach(i => { typeCount[i.type || 'null'] = (typeCount[i.type || 'null'] || 0) + 1; });
    console.log(`  Types: ${JSON.stringify(typeCount, null, 2)}`);

    // Expected: only COLOR and ANTERIOR. If there's UNKNOWN or null, those shouldn't be there.

    await prisma.$disconnect();
}
main().catch(console.error);
