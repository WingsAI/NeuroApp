const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function normalizePatientIds() {
    const patients = await prisma.patient.findMany({
        include: { exams: true }
    });

    console.log('--- NORMALIZANDO IDS DE PACIENTES PARA PADRÃO EYERCLOUD (8 CHARS) ---');
    let fixed = 0;

    for (const p of patients) {
        // Encontra o eyerCloudId e trunca para 8 caracteres
        let eyerIdRaw = p.exams.find(e => e.eyerCloudId)?.eyerCloudId;
        if (!eyerIdRaw) continue;

        const eyerId = eyerIdRaw.substring(0, 8);

        if (p.id !== eyerId) {
            console.log(`🔄 Normalizando: ${p.name.padEnd(30)} | ${p.id} -> ${eyerId}`);

            try {
                const existing = await prisma.patient.findUnique({ where: { id: eyerId }, include: { exams: true } });

                if (existing) {
                    // Se já existe, movemos os exames e deletamos o atual
                    console.log(`   🔗 Já existe destino ${eyerId}. Mesclando exames...`);
                    await prisma.exam.updateMany({
                        where: { patientId: p.id },
                        data: { patientId: eyerId }
                    });
                    await prisma.patient.delete({ where: { id: p.id } });
                } else {
                    // Se não existe, criamos o novo e movemos
                    await prisma.patient.create({
                        data: {
                            id: eyerId,
                            name: p.name,
                            cpf: p.cpf,
                            birthDate: p.birthDate,
                            gender: p.gender,
                            updatedAt: new Date(),
                            ophthalmicDiseases: p.ophthalmicDiseases || undefined,
                            underlyingDiseases: p.underlyingDiseases || undefined,
                        }
                    });
                    await prisma.exam.updateMany({
                        where: { patientId: p.id },
                        data: { patientId: eyerId }
                    });
                    await prisma.patient.delete({ where: { id: p.id } });
                }
                fixed++;
            } catch (e) {
                console.error(`   ❌ Erro ao normalizar ${p.name}:`, e.message);
            }
        }
    }

    console.log(`\nNormalização concluída. ${fixed} pacientes normalizados.`);
}

normalizePatientIds()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
