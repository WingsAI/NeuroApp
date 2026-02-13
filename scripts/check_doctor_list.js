/**
 * check_doctor_list.js - Investigate all patients reported by the doctor
 *
 * For each patient:
 * 1. Find in DB
 * 2. Check images - are they the right patient's images?
 * 3. Check selectedImages in report
 * 4. Compare image URLs vs patient name
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalize(name) {
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const doctorList = [
  "Cidelvania Goncalves de Brito",
  "Clemente Ismael Rochi Galle",
  "Clovis Alvis Torquato",
  "Davina Vales Rodrigues",
  "Diomara de Souza Muniz",
  "Domingas Fernandes da Conceicao",
  "Elisa de Lourdes Vieira Duarte",
  "Elso Augusto dos Santos",
  "Emilia Vieira da Silva",
  "Ernislandia Ribeiro Xavier",
  "Eudociana Cavalcante Macedo",
  "Fabiana Leandro da Silva",
  "Francisa Onelia Bezerra",
  "Francisca Alves Cavalcante da Franca",
  "Francisca Alves da Franca Verissimo",
  "Francisca Maria Ferreira de Souza",
  "Francisca Rodrigues Bizerra Cavalcate",
  "Francisca Sandra de Souza",
  "Francisca Saraiva de Melo",
  "Francisca Torquato Barbosa"
];

async function main() {
  const allPatients = await prisma.patient.findMany({
    include: {
      exams: {
        include: {
          images: { orderBy: { id: 'asc' } },
          report: { select: { id: true, selectedImages: true } }
        }
      }
    }
  });

  console.log(`=== DOCTOR'S REPORTED PATIENTS ===\n`);

  for (const name of doctorList) {
    const normName = normalize(name);

    // Find patient by normalized name (fuzzy)
    const patient = allPatients.find(p => {
      const pNorm = normalize(p.name);
      return pNorm === normName || pNorm.includes(normName) || normName.includes(pNorm);
    });

    if (!patient) {
      // Try partial match
      const words = normName.split(' ');
      const partialMatch = allPatients.find(p => {
        const pNorm = normalize(p.name);
        return words.every(w => pNorm.includes(w));
      });

      if (partialMatch) {
        console.log(`--- ${name} ---`);
        console.log(`  FOUND (partial match): ${partialMatch.name} (ID: ${partialMatch.id})`);
        await analyzePatient(partialMatch);
      } else {
        console.log(`--- ${name} ---`);
        console.log(`  NOT FOUND in DB!`);
      }
      continue;
    }

    console.log(`--- ${name} ---`);
    console.log(`  DB name: ${patient.name} (ID: ${patient.id})`);
    await analyzePatient(patient);
  }

  // Also do a FULL scan of ALL patients for wrong images
  console.log(`\n\n=== FULL SCAN: ALL PATIENTS WITH WRONG IMAGES ===\n`);

  let wrongCount = 0;
  for (const patient of allPatients) {
    const patNorm = normalize(patient.name);

    for (const exam of patient.exams) {
      let wrongImages = 0;
      let rightImages = 0;
      let unknownImages = 0;
      const wrongNames = new Set();

      for (const img of exam.images) {
        if (!img.url) { unknownImages++; continue; }

        try {
          const url = decodeURIComponent(img.url);
          // Extract patient name from URL path: /patients/NAME_HEXID/
          const folderMatch = url.match(/\/patients\/(.+?)_[a-f0-9]{8,24}\//i);
          if (!folderMatch) {
            // Try without hex suffix
            const simpleMatch = url.match(/\/patients\/(.+?)\//i);
            if (simpleMatch) {
              const urlName = normalize(simpleMatch[1].replace(/_/g, ' '));
              if (urlName === patNorm || patNorm.includes(urlName) || urlName.includes(patNorm)) {
                rightImages++;
              } else {
                wrongImages++;
                wrongNames.add(simpleMatch[1]);
              }
            } else {
              unknownImages++;
            }
            continue;
          }

          const urlName = normalize(folderMatch[1].replace(/_/g, ' '));
          if (urlName === patNorm || patNorm.includes(urlName) || urlName.includes(patNorm)) {
            rightImages++;
          } else {
            wrongImages++;
            wrongNames.add(folderMatch[1]);
          }
        } catch (e) {
          unknownImages++;
        }
      }

      if (wrongImages > 0) {
        wrongCount++;
        console.log(`  ${patient.name} (exam ${exam.id}): ${wrongImages} WRONG, ${rightImages} right, ${unknownImages} unknown`);
        console.log(`    Wrong image owners: ${[...wrongNames].join(', ')}`);
      }
    }
  }

  console.log(`\nTotal patients with wrong images: ${wrongCount}`);

  await prisma.$disconnect();
}

async function analyzePatient(patient) {
  const patNorm = normalize(patient.name);

  for (const exam of patient.exams) {
    console.log(`  Exam: ${exam.id} (eyerCloud: ${exam.eyerCloudId || 'null'}) - ${exam.images.length} images`);

    // Check each image URL against patient name
    let wrongImages = 0;
    let rightImages = 0;
    let noUrl = 0;
    const wrongDetails = [];

    for (const img of exam.images) {
      if (!img.url) { noUrl++; continue; }

      try {
        const url = decodeURIComponent(img.url);
        // Extract patient name from URL path
        const folderMatch = url.match(/\/patients\/(.+?)_[a-f0-9]{8,24}\//i);
        if (!folderMatch) {
          // Some URLs may have different structure
          rightImages++; // assume ok if can't parse
          continue;
        }

        const urlName = normalize(folderMatch[1].replace(/_/g, ' '));
        if (urlName === patNorm || patNorm.includes(urlName) || urlName.includes(patNorm)) {
          rightImages++;
        } else {
          wrongImages++;
          wrongDetails.push({
            imgId: img.id,
            urlOwner: folderMatch[1],
            type: img.type
          });
        }
      } catch (e) {
        rightImages++; // assume ok
      }
    }

    if (wrongImages > 0) {
      console.log(`    ❌ ${wrongImages} WRONG images (belong to other patients):`);
      for (const d of wrongDetails) {
        console.log(`      ${d.imgId} -> belongs to ${d.urlOwner} (${d.type})`);
      }
    }
    if (rightImages > 0) {
      console.log(`    ✅ ${rightImages} correct images`);
    }

    // Check report selectedImages
    if (exam.report) {
      const si = exam.report.selectedImages;
      console.log(`    Report exists`);
      if (si && typeof si === 'object') {
        const examImageIds = new Set(exam.images.map(i => i.id));
        for (const eye of ['od', 'oe']) {
          const id = si[eye];
          if (!id) {
            console.log(`      ${eye}: null (not selected)`);
          } else if (examImageIds.has(id)) {
            // Check if this selected image is a wrong one
            const wrongImg = wrongDetails.find(d => d.imgId === id);
            if (wrongImg) {
              console.log(`      ${eye}: ${id} -> ⚠️ SELECTED IMAGE IS WRONG (belongs to ${wrongImg.urlOwner})`);
            } else {
              console.log(`      ${eye}: ${id} -> ✅ OK`);
            }
          } else {
            console.log(`      ${eye}: ${id} -> ❌ NOT FOUND in exam`);
          }
        }
      }
    } else {
      console.log(`    No report`);
    }
  }
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
