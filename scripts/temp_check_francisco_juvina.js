const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const state = require('./eyercloud_downloader/download_state.json');
const mapping = require('./eyercloud_downloader/bytescale_mapping_v2.json');

async function check() {
  try {
    // Francisco Elivan
    const francisco = await prisma.patient.findMany({
      where: { name: { contains: 'FRANCISCO ELIVAN', mode: 'insensitive' } },
      include: {
        exams: {
          include: {
            images: true,
            report: true
          }
        }
      }
    });

    console.log('=== FRANCISCO ELIVAN ===');
    francisco.forEach(p => {
      console.log('Patient:', p.name, 'ID:', p.id);
      p.exams.forEach(e => {
        console.log('  Exam:', e.id);
        console.log('    eyerCloudId:', e.eyerCloudId);
        console.log('    images:', e.images.length);
        console.log('    status:', e.status);
        console.log('    has report:', !!e.report);

        // Check in mapping
        const inMapping = Object.values(mapping).find(m => m.exam_id === e.eyerCloudId);
        console.log('    in bytescale mapping:', !!inMapping);
        if (inMapping) {
          console.log('      mapping images:', inMapping.images?.length || 0);
        }

        // Check in state
        const stateExam = state.exam_details[e.eyerCloudId];
        if (stateExam) {
          console.log('    in download_state: yes');
          console.log('      expected_images:', stateExam.expected_images);
          if (stateExam.image_details) {
            console.log('      image_details count:', stateExam.image_details.length);
          }
        }
      });
    });

    // Juvina
    const juvina = await prisma.patient.findMany({
      where: { name: { contains: 'JUVINA', mode: 'insensitive' } },
      include: {
        exams: {
          include: {
            images: true,
            report: true
          }
        }
      }
    });

    console.log('\n=== JUVINA GINO PEREIRA ===');
    juvina.forEach(p => {
      console.log('Patient:', p.name, 'ID:', p.id);
      p.exams.forEach(e => {
        console.log('  Exam:', e.id);
        console.log('    eyerCloudId:', e.eyerCloudId);
        console.log('    images:', e.images.length);
        e.images.forEach(img => console.log('      -', img.id, img.type, img.eye));
        console.log('    status:', e.status);
        console.log('    has report:', !!e.report);
        if (e.report) {
          console.log('    report selectedOdImage:', e.report.selectedOdImage);
          console.log('    report selectedOeImage:', e.report.selectedOeImage);
        }

        // Check in mapping
        const inMapping = Object.values(mapping).find(m => m.exam_id === e.eyerCloudId);
        console.log('    in bytescale mapping:', !!inMapping);
        if (inMapping) {
          console.log('      mapping images:', inMapping.images?.length || 0);
        }

        // Check in state
        const stateExam = state.exam_details[e.eyerCloudId];
        if (stateExam) {
          console.log('    in download_state: yes');
          console.log('      expected_images:', stateExam.expected_images);
        }
      });
    });

  } finally {
    await prisma.$disconnect();
  }
}

check().catch(console.error);
