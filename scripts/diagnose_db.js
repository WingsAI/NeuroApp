const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
    // 1. Contagem geral
    const totalPatients = await prisma.patient.count();
    const totalExams = await prisma.exam.count();
    const totalImages = await prisma.examImage.count();
    const totalReports = await prisma.medicalReport.count();

    console.log('=== CONTAGENS ===');
    console.log('Pacientes:', totalPatients);
    console.log('Exames:', totalExams);
    console.log('Imagens:', totalImages);
    console.log('Laudos:', totalReports);

    // 2. Todos pacientes com seus exames
    const patients = await prisma.patient.findMany({
        include: {
            exams: {
                include: { report: true, images: true }
            }
        },
        orderBy: { name: 'asc' }
    });

    // 3. Análise de IDs
    console.log('\n=== ANÁLISE DE IDs DOS PACIENTES ===');
    let shortIds = 0;
    let longIds = 0;
    let manualIds = 0;
    let otherIds = 0;

    patients.forEach(p => {
        if (p.id.startsWith('manual-')) manualIds++;
        else if (/^[0-9a-f]{8}$/.test(p.id)) shortIds++;
        else if (/^[0-9a-f]{24}$/.test(p.id)) longIds++;
        else otherIds++;
    });

    console.log('IDs curtos (8 hex):', shortIds);
    console.log('IDs longos (24 hex):', longIds);
    console.log('IDs manual-:', manualIds);
    console.log('Outros IDs:', otherIds);

    // 4. Duplicatas por nome
    const nameMap = {};
    patients.forEach(p => {
        const norm = p.name.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!nameMap[norm]) nameMap[norm] = [];
        nameMap[norm].push(p);
    });

    console.log('\n=== DUPLICATAS POR NOME ===');
    let dupCount = 0;
    for (const name in nameMap) {
        if (nameMap[name].length > 1) {
            dupCount++;
            console.log('\n' + name + ' (' + nameMap[name].length + ' registros):');
            nameMap[name].forEach(p => {
                const exams = p.exams.length;
                const images = p.exams.reduce((s, e) => s + e.images.length, 0);
                const hasReport = p.exams.some(e => e.report) ? 'TEM LAUDO' : 'sem laudo';
                const eyerIds = p.exams.map(e => e.eyerCloudId).filter(Boolean);
                console.log('  ID: ' + p.id + ' | Exames: ' + exams + ' | Imgs: ' + images + ' | ' + hasReport + ' | EyerIds: ' + JSON.stringify(eyerIds));
            });
        }
    }
    console.log('\nTotal grupos duplicados:', dupCount);

    // 5. Pacientes sem exame
    const noExams = patients.filter(p => p.exams.length === 0);
    console.log('\n=== PACIENTES SEM EXAMES ===');
    console.log('Total:', noExams.length);
    noExams.forEach(p => console.log('  ' + p.id + ' - ' + p.name));

    // 6. Exames sem imagens
    const allExams = await prisma.exam.findMany({ include: { images: true } });
    const noImages = allExams.filter(e => e.images.length === 0);
    console.log('\n=== EXAMES SEM IMAGENS ===');
    console.log('Total:', noImages.length);
    noImages.forEach(e => console.log('  ExamID: ' + e.id + ' | PatientID: ' + e.patientId + ' | EyerCloudId: ' + e.eyerCloudId));

    // 7. Lista todos pacientes com IDs
    console.log('\n=== TODOS OS PACIENTES ===');
    patients.forEach(p => {
        const exams = p.exams.length;
        const images = p.exams.reduce((s, e) => s + e.images.length, 0);
        const hasReport = p.exams.some(e => e.report) ? 'LAUDO' : 'pend';
        const eyerIds = p.exams.map(e => e.eyerCloudId || 'null').join(',');
        console.log(p.id.padEnd(30) + ' | ' + p.name.padEnd(45) + ' | Ex:' + exams + ' Img:' + images + ' ' + hasReport + ' | Eyer:' + eyerIds);
    });

    await prisma.$disconnect();
}

diagnose().catch(console.error);
