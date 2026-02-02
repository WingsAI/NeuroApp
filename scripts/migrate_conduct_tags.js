const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrate() {
    console.log('🚀 Iniciando migração de tags de conduta baseada em regras...');

    try {
        const patients = await prisma.patient.findMany({
            where: {
                status: 'completed',
                report: { isNot: null }
            },
            include: {
                report: true
            }
        });

        console.log(`🔍 Encontrados ${patients.length} pacientes com laudos concluídos.`);
        let updatedCount = 0;

        for (const patient of patients) {
            const report = patient.report;
            if (!report) continue;

            let findings;
            try {
                findings = typeof report.findings === 'string' ? JSON.parse(report.findings) : report.findings;
            } catch (e) {
                console.error(`❌ Erro ao parsear findings do paciente ${patient.name}`);
                continue;
            }

            let diagnosticConditions;
            try {
                diagnosticConditions = typeof report.diagnosticConditions === 'string'
                    ? JSON.parse(report.diagnosticConditions)
                    : report.diagnosticConditions;
            } catch (e) {
                diagnosticConditions = report.diagnosticConditions || {};
            }

            let changed = false;

            // Regra 1: "Impossível" -> re-convocar prioridade
            if (findings.od?.quality === 'impossible' || findings.oe?.quality === 'impossible') {
                if (!diagnosticConditions.reconvocarUrgente) {
                    diagnosticConditions.reconvocarUrgente = true;
                    changed = true;
                }
            }

            // Regra 2: "Insatisfatória" -> re-convocar
            if (findings.od?.quality === 'unsatisfactory' || findings.oe?.quality === 'unsatisfactory') {
                if (!diagnosticConditions.reconvocar) {
                    diagnosticConditions.reconvocar = true;
                    changed = true;
                }
            }

            // Regra 3: "Encaminhar" na conduta -> tag encaminhar
            const conduct = (report.suggestedConduct || '').toLowerCase();
            if (conduct.includes('encaminhar')) {
                if (!diagnosticConditions.encaminhar) {
                    diagnosticConditions.encaminhar = true;
                    changed = true;
                }
            }

            if (changed) {
                await prisma.medicalReport.update({
                    where: { id: report.id },
                    data: {
                        diagnosticConditions: diagnosticConditions
                    }
                });
                updatedCount++;
                console.log(`✅ Atualizado: ${patient.name}`);
            }
        }

        console.log(`\n🎉 Migração finalizada! ${updatedCount} laudos foram atualizados.`);

    } catch (error) {
        console.error('❌ Erro na migração:', error);
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
