/**
 * Teste de Validação de Dados do NeuroApp
 * ========================================
 * 
 * Este script valida a integridade dos dados após sincronizações.
 * Execute após cada grande update para garantir que os dados estão corretos.
 * 
 * Uso:
 *   node scripts/validate_data.js              # Executa todos os testes
 *   node scripts/validate_data.js --patient "NOME"  # Valida paciente específico
 * 
 * O que este teste valida:
 * 1. Todos os pacientes têm exames associados
 * 2. Todos os exames têm imagens associadas
 * 3. Dados críticos estão preenchidos (CPF, data de nascimento, etc.)
 * 4. Datas são válidas (não no futuro, formato correto)
 * 5. Comparação com dados do EyerCloud (se disponível)
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Cores para console
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

function log(color, symbol, message) {
    console.log(`${color}${symbol}${RESET} ${message}`);
}

function success(message) { log(GREEN, '✅', message); }
function warning(message) { log(YELLOW, '⚠️', message); }
function error(message) { log(RED, '❌', message); }
function info(message) { log(BLUE, 'ℹ️', message); }

async function loadEyerCloudMapping() {
    const mappingPath = path.join(process.cwd(), 'scripts', 'eyercloud_downloader', 'bytescale_mapping_cleaned.json');
    if (!fs.existsSync(mappingPath)) {
        return null;
    }
    return JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
}

async function validatePatients(patientName = null) {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TESTE DE VALIDAÇÃO DE DADOS DO NEUROAPP');
    console.log('='.repeat(70));
    console.log(`📅 Data: ${new Date().toLocaleString('pt-BR')}\n`);

    const results = {
        totalPatients: 0,
        patientsWithExams: 0,
        patientsWithImages: 0,
        patientsWithCPF: 0,
        patientsWithBirthDate: 0,
        patientsWithGender: 0,
        patientsWithDiseases: 0,
        patientsWithLocation: 0,
        examsWithValidDates: 0,
        totalExams: 0,
        totalImages: 0,
        errors: [],
        warnings: []
    };

    // Busca pacientes no banco
    const whereClause = patientName
        ? { name: { contains: patientName, mode: 'insensitive' } }
        : {};

    const patients = await prisma.patient.findMany({
        where: whereClause,
        include: {
            exams: {
                include: {
                    images: true
                }
            }
        }
    });

    if (patients.length === 0) {
        error('Nenhum paciente encontrado no banco de dados!');
        return results;
    }

    results.totalPatients = patients.length;
    info(`Encontrados ${patients.length} pacientes no banco.\n`);

    // Carrega mapping do EyerCloud para comparação
    const mapping = await loadEyerCloudMapping();
    if (mapping) {
        info(`Mapping do EyerCloud carregado com ${Object.keys(mapping).length} entradas.\n`);
    }

    console.log('🔍 Validando pacientes...\n');

    for (const patient of patients) {
        let hasIssues = false;
        const issues = [];

        // Validação 1: Paciente tem exames?
        if (patient.exams.length > 0) {
            results.patientsWithExams++;
        } else {
            issues.push('Sem exames associados');
            results.warnings.push(`${patient.name}: Sem exames`);
        }

        // Validação 2: Exames têm imagens?
        const totalImagesForPatient = patient.exams.reduce((sum, e) => sum + e.images.length, 0);
        if (totalImagesForPatient > 0) {
            results.patientsWithImages++;
        } else if (patient.exams.length > 0) {
            issues.push('Exames sem imagens');
            results.warnings.push(`${patient.name}: Exames sem imagens`);
        }
        results.totalImages += totalImagesForPatient;
        results.totalExams += patient.exams.length;

        // Validação 3: CPF
        if (patient.cpf) {
            results.patientsWithCPF++;
        } else {
            issues.push('Sem CPF');
        }

        // Validação 4: Data de nascimento
        if (patient.birthDate) {
            results.patientsWithBirthDate++;

            // Valida se a data é razoável (não no futuro, não muito antiga)
            const birthYear = patient.birthDate.getFullYear();
            const currentYear = new Date().getFullYear();
            if (birthYear > currentYear) {
                issues.push(`Data de nascimento no futuro (${birthYear})`);
                results.errors.push(`${patient.name}: birthDate no futuro`);
            } else if (birthYear < 1900) {
                issues.push(`Data de nascimento muito antiga (${birthYear})`);
                results.warnings.push(`${patient.name}: birthDate muito antiga`);
            }
        } else {
            issues.push('Sem data de nascimento');
        }

        // Validação 5: Sexo
        if (patient.gender) {
            results.patientsWithGender++;
        } else {
            issues.push('Sem sexo');
        }

        // Validação 6: Doenças de base
        if (patient.underlyingDiseases &&
            typeof patient.underlyingDiseases === 'object' &&
            Object.values(patient.underlyingDiseases).some(v => v === true)) {
            results.patientsWithDiseases++;
        }

        // Validação 7: Exames com localização
        for (const exam of patient.exams) {
            if (exam.location && exam.location !== 'Phelcom EyeR Cloud') {
                results.patientsWithLocation++;
                break;
            }
        }

        // Validação 8: Datas dos exames
        for (const exam of patient.exams) {
            if (exam.examDate) {
                const examDate = new Date(exam.examDate);
                const now = new Date();

                // Permite até 1 dia no futuro (timezone)
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);

                if (examDate > tomorrow) {
                    issues.push(`Exame com data no futuro: ${exam.examDate.toISOString().split('T')[0]}`);
                    results.errors.push(`${patient.name}: examDate no futuro`);
                } else {
                    results.examsWithValidDates++;
                }
            }
        }

        // Comparação com EyerCloud (se disponível)
        if (mapping) {
            const eyerCloudEntry = Object.values(mapping).find(
                e => e.patient_name?.toUpperCase() === patient.name.toUpperCase()
            );

            if (eyerCloudEntry) {
                // Compara CPF
                if (eyerCloudEntry.cpf && !patient.cpf) {
                    issues.push('CPF disponível no EyerCloud mas faltando no banco');
                }
                // Compara data de nascimento
                if (eyerCloudEntry.birthday && !patient.birthDate) {
                    issues.push('birthDate disponível no EyerCloud mas faltando no banco');
                }
                // Compara sexo
                if (eyerCloudEntry.gender && !patient.gender) {
                    issues.push('gender disponível no EyerCloud mas faltando no banco');
                }
            }
        }

        // Log apenas pacientes com problemas graves
        if (issues.length > 3) {
            hasIssues = true;
            warning(`${patient.name}: ${issues.join(', ')}`);
        }
    }

    // Resumo
    console.log('\n' + '='.repeat(70));
    console.log('📊 RESUMO DA VALIDAÇÃO');
    console.log('='.repeat(70));

    console.log('\n📋 Pacientes:');
    console.log(`   Total: ${results.totalPatients}`);
    console.log(`   Com exames: ${results.patientsWithExams} (${(results.patientsWithExams / results.totalPatients * 100).toFixed(1)}%)`);
    console.log(`   Com imagens: ${results.patientsWithImages} (${(results.patientsWithImages / results.totalPatients * 100).toFixed(1)}%)`);

    console.log('\n📋 Dados Demográficos:');
    console.log(`   Com CPF: ${results.patientsWithCPF} (${(results.patientsWithCPF / results.totalPatients * 100).toFixed(1)}%)`);
    console.log(`   Com Data de Nascimento: ${results.patientsWithBirthDate} (${(results.patientsWithBirthDate / results.totalPatients * 100).toFixed(1)}%)`);
    console.log(`   Com Sexo: ${results.patientsWithGender} (${(results.patientsWithGender / results.totalPatients * 100).toFixed(1)}%)`);
    console.log(`   Com Doenças de Base: ${results.patientsWithDiseases} (${(results.patientsWithDiseases / results.totalPatients * 100).toFixed(1)}%)`);
    console.log(`   Com Localização específica: ${results.patientsWithLocation}`);

    console.log('\n📋 Exames e Imagens:');
    console.log(`   Total de exames: ${results.totalExams}`);
    console.log(`   Total de imagens: ${results.totalImages}`);
    console.log(`   Exames com datas válidas: ${results.examsWithValidDates}`);

    // Status final
    console.log('\n' + '='.repeat(70));

    if (results.errors.length > 0) {
        error(`${results.errors.length} ERROS CRÍTICOS encontrados!`);
        console.log('   Erros:');
        results.errors.slice(0, 10).forEach(e => console.log(`     • ${e}`));
        if (results.errors.length > 10) {
            console.log(`     ... e mais ${results.errors.length - 10} erros`);
        }
    }

    if (results.warnings.length > 0) {
        warning(`${results.warnings.length} avisos encontrados`);
    }

    // Verifica se passou nos critérios mínimos
    const passRate = {
        exams: results.patientsWithExams / results.totalPatients,
        images: results.patientsWithImages / results.totalPatients,
    };

    const passed = passRate.exams >= 0.95 && passRate.images >= 0.95 && results.errors.length === 0;

    console.log('\n' + '='.repeat(70));
    if (passed) {
        success('VALIDAÇÃO PASSOU! ✓');
    } else {
        error('VALIDAÇÃO FALHOU!');
        if (passRate.exams < 0.95) {
            error(`   • Taxa de pacientes com exames muito baixa: ${(passRate.exams * 100).toFixed(1)}% (mínimo: 95%)`);
        }
        if (passRate.images < 0.95) {
            error(`   • Taxa de pacientes com imagens muito baixa: ${(passRate.images * 100).toFixed(1)}% (mínimo: 95%)`);
        }
    }
    console.log('='.repeat(70) + '\n');

    await prisma.$disconnect();
    return results;
}

async function validateSpecificPatient(patientName) {
    console.log('\n' + '='.repeat(70));
    console.log(`🔍 VALIDAÇÃO DETALHADA: ${patientName}`);
    console.log('='.repeat(70));

    const patient = await prisma.patient.findFirst({
        where: { name: { contains: patientName, mode: 'insensitive' } },
        include: {
            exams: {
                include: {
                    images: true,
                    report: true
                }
            }
        }
    });

    if (!patient) {
        error(`Paciente "${patientName}" não encontrado no banco!`);
        await prisma.$disconnect();
        return;
    }

    console.log('\n📋 DADOS DO BANCO:');
    console.log(`   Nome: ${patient.name}`);
    console.log(`   ID: ${patient.id}`);
    console.log(`   CPF: ${patient.cpf || '❌ NÃO INFORMADO'}`);
    console.log(`   Data de Nascimento: ${patient.birthDate ? patient.birthDate.toLocaleDateString('pt-BR') : '❌ NÃO INFORMADO'}`);
    console.log(`   Sexo: ${patient.gender || '❌ NÃO INFORMADO'}`);
    console.log(`   Doenças de Base: ${JSON.stringify(patient.underlyingDiseases) || '❌ NÃO INFORMADO'}`);

    console.log(`\n📋 EXAMES (${patient.exams.length}):`);
    for (const exam of patient.exams) {
        console.log(`   • Exame ${exam.eyerCloudId || exam.id.slice(0, 8)}`);
        console.log(`     Data: ${exam.examDate ? exam.examDate.toLocaleDateString('pt-BR') : '❌ NÃO INFORMADO'}`);
        console.log(`     Local: ${exam.location || '❌ NÃO INFORMADO'}`);
        console.log(`     Status: ${exam.status}`);
        console.log(`     Imagens: ${exam.images.length}`);
        if (exam.images.length > 0) {
            console.log(`     URLs: ${exam.images.map(i => i.url.split('/').pop()).join(', ')}`);
        }
        if (exam.report) {
            console.log(`     Laudo: ✅ Sim (${exam.report.doctorName})`);
        }
    }

    // Compara com EyerCloud
    const mapping = await loadEyerCloudMapping();
    if (mapping) {
        const eyerCloudEntry = Object.values(mapping).find(
            e => e.patient_name?.toUpperCase() === patient.name.toUpperCase()
        );

        if (eyerCloudEntry) {
            console.log('\n📋 DADOS DO EYERCLOUD (bytescale_mapping):');
            console.log(`   Nome: ${eyerCloudEntry.patient_name}`);
            console.log(`   CPF: ${eyerCloudEntry.cpf || '❌ NÃO INFORMADO'}`);
            console.log(`   Data de Nascimento: ${eyerCloudEntry.birthday || '❌ NÃO INFORMADO'}`);
            console.log(`   Sexo: ${eyerCloudEntry.gender || '❌ NÃO INFORMADO'}`);
            console.log(`   Data do Exame: ${eyerCloudEntry.exam_date || '❌ NÃO INFORMADO'}`);
            console.log(`   Clínica: ${eyerCloudEntry.clinic_name || '❌ NÃO INFORMADO'}`);
            console.log(`   Doenças: ${JSON.stringify(eyerCloudEntry.underlying_diseases) || '❌ NÃO INFORMADO'}`);
            console.log(`   Imagens no mapping: ${eyerCloudEntry.images?.length || 0}`);
        } else {
            warning('Paciente não encontrado no mapping do EyerCloud!');
        }
    }

    console.log('\n' + '='.repeat(70) + '\n');
    await prisma.$disconnect();
}

// Main
async function main() {
    const args = process.argv.slice(2);
    const patientIndex = args.indexOf('--patient');

    if (patientIndex !== -1 && args[patientIndex + 1]) {
        await validateSpecificPatient(args[patientIndex + 1]);
    } else {
        await validatePatients();
    }
}

main().catch(console.error);
