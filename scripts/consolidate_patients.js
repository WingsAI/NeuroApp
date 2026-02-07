const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function consolidate() {
    const execute = process.argv.includes('--execute');
    console.log(`\n======================================================================`);
    console.log(`🔧 CONSOLIDAÇÃO DE PACIENTES DUPLICADOS`);
    console.log(`Modo: ${execute ? 'EXECUÇÃO' : 'VERIFICAÇÃO'}`);
    console.log(`======================================================================\n`);

    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: { report: true, images: true }
            }
        }
    });

    const nameMap = {};
    patients.forEach(p => {
        const normalizedName = p.name.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!nameMap[normalizedName]) nameMap[normalizedName] = [];
        nameMap[normalizedName].push(p);
    });

    let groupsProcessed = 0;
    let totalDeletions = 0;
    let totalMerges = 0;

    for (const name in nameMap) {
        if (nameMap[name].length <= 1) continue;

        groupsProcessed++;
        const group = nameMap[name];

        // Critério de escolha do Paciente Canônico:
        // 1. O que tem o ID mais "limpo" (8 caracteres ou ID do EyerCloud)
        // 2. O que tem mais exames
        // 3. O que foi criado primeiro
        const canonical = group.sort((a, b) => {
            const aIdLen = a.id.length;
            const bIdLen = b.id.length;
            if (aIdLen === 8 && bIdLen !== 8) return -1;
            if (bIdLen === 8 && aIdLen !== 8) return 1;
            return b.exams.length - a.exams.length;
        })[0];

        console.log(`👤 Grupo: ${name}`);
        console.log(`   🏆 Canônico: ${canonical.id} (${canonical.exams.length} exames)`);

        for (const other of group) {
            if (other.id === canonical.id) continue;

            console.log(`   🔗 Mesclando: ${other.id} -> ${canonical.id}`);

            // 1. Mescla Metadados do Paciente (sexo, cpf, doenças)
            if (execute) {
                await prisma.patient.update({
                    where: { id: canonical.id },
                    data: {
                        cpf: canonical.cpf || other.cpf || undefined,
                        birthDate: canonical.birthDate || other.birthDate || undefined,
                        gender: canonical.gender || other.gender || undefined,
                        underlyingDiseases: canonical.underlyingDiseases || other.underlyingDiseases || undefined,
                        ophthalmicDiseases: canonical.ophthalmicDiseases || other.ophthalmicDiseases || undefined,
                    }
                });
            }

            // 2. Processa Exames do 'other'
            for (const otherExam of other.exams) {
                const canonExam = canonical.exams.find(e => e.eyerCloudId === otherExam.eyerCloudId && e.eyerCloudId !== null);

                if (canonExam) {
                    console.log(`      📝 Exame repetido (EyerID ${otherExam.eyerCloudId}). Mesclando detalhes...`);

                    if (execute) {
                        // Move Report se o canônico não tiver
                        if (!canonExam.report && otherExam.report) {
                            await prisma.medicalReport.update({
                                where: { id: otherExam.report.id },
                                data: { examId: canonExam.id }
                            });
                        }

                        // Move Images se o canônico tiver menos
                        if (canonExam.images.length === 0 && otherExam.images.length > 0) {
                            await prisma.examImage.updateMany({
                                where: { examId: otherExam.id },
                                data: { examId: canonExam.id }
                            });
                        }

                        // Deleta o exame duplicado (suas associações foram movidas ou são redundantes)
                        await prisma.exam.delete({ where: { id: otherExam.id } });
                    }
                    totalMerges++;
                } else {
                    console.log(`      🚚 Movendo exame ${otherExam.id} para paciente canônico...`);
                    if (execute) {
                        await prisma.exam.update({
                            where: { id: otherExam.id },
                            data: { patientId: canonical.id }
                        });
                    }
                }
            }

            // 3. Deleta o paciente redundante
            if (execute) {
                await prisma.patient.delete({ where: { id: other.id } });
            }
            totalDeletions++;
        }
    }

    console.log(`\n======================================================================`);
    console.log(`📊 RESUMO DA OPERAÇÃO`);
    console.log(`Grupos processados: ${groupsProcessed}`);
    console.log(`Pacientes deletados: ${totalDeletions}`);
    console.log(`Exames mesclados: ${totalMerges}`);
    if (!execute) console.log(`\n⚠️  Nenhuma alteração foi feita. Use --execute para aplicar.`);
    console.log(`======================================================================\n`);
}

consolidate()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
