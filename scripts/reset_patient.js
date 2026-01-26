const { PrismaClient } = require('@prisma/client');

async function main() {
    const prisma = new PrismaClient();
    const patientId = "697001cd029f1e6981546a8a";

    // Update status to pending
    await prisma.patient.update({
        where: { id: patientId },
        data: { status: 'pending' }
    });

    // Delete MedicalReport if exists
    await prisma.medicalReport.deleteMany({
        where: { patientId: patientId }
    });

    // Delete PatientReferral if exists
    await prisma.patientReferral.deleteMany({
        where: { patientId: patientId }
    });

    console.log('Patient JOÃO JOSIAS DA SILVA reset to pending status.');

    await prisma.$disconnect();
}

main();
