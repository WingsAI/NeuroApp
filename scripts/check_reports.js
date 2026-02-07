const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkReports() {
    try {
        const count = await prisma.medicalReport.count();
        console.log('Total Reports:', count);

        const reports = await prisma.medicalReport.findMany({
            include: {
                exam: {
                    include: {
                        patient: true
                    }
                }
            }
        });

        reports.forEach((r, idx) => {
            if (idx < 10) {
                console.log(`Report ${idx + 1}: ${r.exam.patient.name} | PatientID: ${r.exam.patient.id} | ExamID: ${r.exam.id} | EyerCloudID: ${r.exam.eyerCloudId}`);
            }
        });

        // Check if any report is orphaned (no exam/patient) - though Prisma usually prevents this with referential integrity
    } catch (err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}

checkReports();
