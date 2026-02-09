const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PREVIEW = !process.argv.includes('--execute');

async function fixDuplicateExams() {
  console.log('=== Fix Duplicate Exams ===');
  console.log(PREVIEW ? 'MODE: PREVIEW (use --execute to apply changes)\n' : 'MODE: EXECUTE\n');

  try {
    const patients = await prisma.patient.findMany({
      include: {
        exams: {
          include: {
            images: true,
            report: true,
            referral: true
          }
        }
      }
    });

    let totalPatientsWithDuplicates = 0;
    let totalExamsToDelete = 0;
    let totalExamsDeleted = 0;

    for (const patient of patients) {
      // Group exams by eyerCloudId (excluding CML exams)
      const eyerCloudExams = patient.exams.filter(e => e.eyerCloudId && !e.eyerCloudId.startsWith('cml'));
      const grouped = {};

      eyerCloudExams.forEach(exam => {
        if (!grouped[exam.eyerCloudId]) {
          grouped[exam.eyerCloudId] = [];
        }
        grouped[exam.eyerCloudId].push(exam);
      });

      // Find duplicates
      const duplicateGroups = Object.entries(grouped).filter(([_, exams]) => exams.length > 1);

      if (duplicateGroups.length > 0) {
        totalPatientsWithDuplicates++;

        console.log(`\nPatient: ${patient.name} (ID: ${patient.id})`);

        for (const [eyerCloudId, exams] of duplicateGroups) {
          console.log(`  eyerCloudId: ${eyerCloudId} - ${exams.length} duplicates`);

          // Sort to keep the "best" exam:
          // 1. Has report
          // 2. Has more images
          // 3. Is completed
          // 4. Created first (oldest)
          const sorted = exams.sort((a, b) => {
            if (!!a.report !== !!b.report) return a.report ? -1 : 1;
            if (a.images.length !== b.images.length) return b.images.length - a.images.length;
            if (a.status !== b.status) return a.status === 'completed' ? -1 : 1;
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          const toKeep = sorted[0];
          const toDelete = sorted.slice(1);

          console.log(`    KEEP: ${toKeep.id} (images: ${toKeep.images.length}, report: ${!!toKeep.report}, status: ${toKeep.status})`);
          toDelete.forEach(exam => {
            console.log(`    DELETE: ${exam.id} (images: ${exam.images.length}, report: ${!!exam.report}, status: ${exam.status})`);
            totalExamsToDelete++;
          });

          if (!PREVIEW) {
            // Delete duplicate exams (cascade will delete images)
            for (const exam of toDelete) {
              await prisma.exam.delete({
                where: { id: exam.id }
              });
              totalExamsDeleted++;
              console.log(`      ✓ Deleted exam ${exam.id}`);
            }
          }
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Patients with duplicate exams: ${totalPatientsWithDuplicates}`);
    console.log(`Total exams to delete: ${totalExamsToDelete}`);

    if (!PREVIEW) {
      console.log(`Total exams deleted: ${totalExamsDeleted}`);
    } else {
      console.log('\nRun with --execute to apply changes');
    }

  } finally {
    await prisma.$disconnect();
  }
}

fixDuplicateExams().catch(console.error);
