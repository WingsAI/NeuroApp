const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Investigating FRANCISCO SERGIO OLIVEIRA ===\n');

  const dlStatePath = path.join(__dirname, 'eyercloud_downloader', 'download_state.json');
  const pdPath = path.join(__dirname, 'eyercloud_downloader', 'patient_details.json');
  const downloadState = JSON.parse(fs.readFileSync(dlStatePath, 'utf-8'));
  const patientDetails = JSON.parse(fs.readFileSync(pdPath, 'utf-8'));

  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'FRANCISCO SERGIO', mode: 'insensitive' } },
    include: { exams: { include: { images: true, report: true, referral: true } } },
  });

  if (patients.length === 0) { console.log('No patients found.'); return; }
  console.log('Found ' + patients.length + ' patient(s)\n');

  for (const patient of patients) {
    console.log('='.repeat(80));
    console.log('PATIENT DETAILS');
    console.log('='.repeat(80));
    console.log('  Name:      ' + patient.name);
    console.log('  ID:        ' + patient.id + ' (' + patient.id.length + ' chars)');
    console.log('  CPF:       ' + (patient.cpf || '(null)'));
    console.log('  BirthDate: ' + (patient.birthDate ? patient.birthDate.toISOString().split('T')[0] : '(null)'));
    console.log('  Gender:    ' + (patient.gender || '(null)'));
    console.log('  Education: ' + (patient.education || '(null)'));
    console.log('  Ethnicity: ' + (patient.ethnicity || '(null)'));
    console.log('  Phone:     ' + (patient.phone || '(null)'));
    console.log('  Underlying diseases: ' + JSON.stringify(patient.underlyingDiseases));
    console.log('  Ophthalmic diseases: ' + JSON.stringify(patient.ophthalmicDiseases));
    console.log('  Created:   ' + patient.createdAt.toISOString());
    console.log('  Updated:   ' + patient.updatedAt.toISOString());

    // Check CPF against patient_details.json
    console.log('\n--- CPF CHECK vs patient_details.json ---');
    const normalizedName = patient.name.toUpperCase().trim();
    let detailsMatch = null;
    for (const [key, details] of Object.entries(patientDetails)) {
      if (details.fullName && details.fullName.toUpperCase().trim() === normalizedName) {
        detailsMatch = { key, ...details };
        break;
      }
    }
    if (detailsMatch) {
      console.log('  Found in patient_details.json (key: ' + detailsMatch.key + '):');
      console.log('    fullName: ' + detailsMatch.fullName);
      console.log('    cpf:      ' + (detailsMatch.cpf || '(empty)'));
      console.log('    gender:   ' + (detailsMatch.gender || '(empty)'));
      console.log('    birthday: ' + (detailsMatch.birthday || '(empty)'));
      if (patient.cpf && detailsMatch.cpf && patient.cpf !== detailsMatch.cpf) {
        console.log('    *** CPF MISMATCH: DB=' + patient.cpf + ' vs EyerCloud=' + detailsMatch.cpf + ' ***');
      } else if (!patient.cpf && detailsMatch.cpf) {
        console.log('    *** CPF MISSING IN DB but available: ' + detailsMatch.cpf + ' ***');
      } else if (patient.cpf === detailsMatch.cpf) {
        console.log('    CPF matches.');
      } else {
        console.log('    Both CPF values are empty/null.');
      }
    } else {
      console.log('  NOT found in patient_details.json by name: ' + normalizedName);
    }

    // Check download_state.json
    console.log('\n--- EYERCLOUD DOWNLOAD STATE CHECK ---');
    const stateEntries = [];
    for (const [examId, entry] of Object.entries(downloadState)) {
      if (entry.patient_name && entry.patient_name.toUpperCase().trim().includes('FRANCISCO SERGIO')) {
        stateEntries.push({ examId, ...entry });
      }
    }
    if (stateEntries.length > 0) {
      console.log('  Found ' + stateEntries.length + ' exam(s) in download_state.json:');
      for (const entry of stateEntries) {
        const imageDetails = entry.image_details || [];
        const colorCount = imageDetails.filter(i => i.type === 'COLOR').length;
        const anteriorCount = imageDetails.filter(i => i.type === 'ANTERIOR').length;
        const redfreeCount = imageDetails.filter(i => i.type === 'REDFREE').length;
        console.log('    Exam ID:   ' + entry.examId + ' (' + (entry.examId ? entry.examId.length : 0) + ' chars)');
        console.log('    Patient:   ' + entry.patient_name);
        console.log('    Exam Date: ' + (entry.exam_date || '(unknown)'));
        console.log('    Location:  ' + (entry.clinic_name || entry.location || '(unknown)'));
        console.log('    Expected images (all types): ' + (entry.expected_images || 0));
        console.log('    image_details: ' + imageDetails.length + ' total (' + colorCount + ' COLOR, ' + anteriorCount + ' ANTERIOR, ' + redfreeCount + ' REDFREE)');
        console.log('    Expected in DB (COLOR+ANTERIOR): ' + (colorCount + anteriorCount));
      }
    } else {
      console.log('  NOT found in download_state.json');
    }

    // Exams
    console.log('\n--- EXAMS (' + patient.exams.length + ') ---');
    for (const exam of patient.exams) {
      console.log('\n  Exam ID:        ' + exam.id + ' (' + exam.id.length + ' chars)');
      console.log('  EyerCloud ID:   ' + (exam.eyerCloudId || '(null)') + ' (' + (exam.eyerCloudId ? exam.eyerCloudId.length : 0) + ' chars)');
      console.log('  Date:           ' + exam.examDate.toISOString().split('T')[0]);
      console.log('  Location:       ' + exam.location);
      console.log('  Status:         ' + exam.status);
      console.log('  Technician:     ' + exam.technicianName);
      console.log('  Image count:    ' + exam.images.length);

      if (exam.images.length > 0) {
        console.log('\n  IMAGES (' + exam.images.length + '):');
        for (const img of exam.images) {
          const urlParts = img.url.split('/');
          const folderName = urlParts.length >= 3 ? urlParts[urlParts.length - 2] : '(unknown)';
          console.log('    [' + (img.type || 'NO_TYPE') + '] ID: ' + img.id);
          console.log('      URL: ' + img.url);
          console.log('      FileName: ' + img.fileName);
          console.log('      Folder in URL: ' + folderName);
        }

        const matchingState = stateEntries.find(e => e.examId === exam.eyerCloudId);
        if (matchingState) {
          const imageDetails = matchingState.image_details || [];
          const expectedCA = imageDetails.filter(i => i.type === 'COLOR' || i.type === 'ANTERIOR').length;
          const dbCount = exam.images.length;
          if (dbCount === expectedCA) {
            console.log('\n    IMAGE COUNT OK: DB has ' + dbCount + ', expected ' + expectedCA + ' (COLOR+ANTERIOR)');
          } else {
            console.log('\n    *** IMAGE COUNT MISMATCH: DB has ' + dbCount + ', expected ' + expectedCA + ' (COLOR+ANTERIOR) ***');
            console.log('    Expected image UUIDs from EyerCloud:');
            for (const detail of imageDetails.filter(i => i.type !== 'REDFREE')) {
              console.log('      [' + detail.type + '] ' + (detail.uuid || detail.id || '(no uuid)'));
            }
          }
        } else {
          console.log('\n    No matching entry in download_state.json for eyerCloudId ' + exam.eyerCloudId);
        }
      }

      // Report
      if (exam.report) {
        console.log('\n  REPORT:');
        console.log('    ID:           ' + exam.report.id);
        console.log('    Doctor:       ' + exam.report.doctorName);
        console.log('    Diagnosis:    ' + exam.report.diagnosis);
        const fp = exam.report.findings.length > 200 ? exam.report.findings.substring(0, 200) + '...' : exam.report.findings;
        console.log('    Findings:     ' + fp);
        console.log('    Conduct:      ' + (exam.report.suggestedConduct || '(null)'));
        console.log('    Completed:    ' + exam.report.completedAt.toISOString());
        console.log('    CRM:          ' + (exam.report.doctorCRM || '(null)'));

        const selectedImages = exam.report.selectedImages;
        if (selectedImages && Array.isArray(selectedImages)) {
          console.log('\n    SELECTED IMAGES (' + selectedImages.length + '):');
          const examImageIds = new Set(exam.images.map(i => i.id));
          const allPatientImageIds = new Set();
          for (const ex of patient.exams) {
            for (const img of ex.images) { allPatientImageIds.add(img.id); }
          }
          for (const selId of selectedImages) {
            const inExam = examImageIds.has(selId);
            const inPatient = allPatientImageIds.has(selId);
            let status = 'MISSING';
            if (inExam) status = 'OK (in this exam)';
            else if (inPatient) status = 'OK (in another exam)';
            else {
              const dashIdx = selId.lastIndexOf('-');
              if (dashIdx !== -1) {
                const suffix = selId.substring(dashIdx + 1);
                const idx = parseInt(suffix);
                if (!isNaN(idx) && idx < exam.images.length) {
                  status = 'MISSING but index ' + idx + ' could resolve to ' + exam.images[idx].id;
                }
              }
            }
            console.log('      ' + JSON.stringify(selId) + ' -> ' + status);
          }
        } else {
          console.log('    selectedImages: ' + JSON.stringify(selectedImages));
        }
      } else {
        console.log('\n  REPORT: (none)');
      }

      // Referral
      if (exam.referral) {
        console.log('\n  REFERRAL:');
        console.log('    ID:        ' + exam.referral.id);
        console.log('    Specialty: ' + exam.referral.specialty);
        console.log('    Urgency:   ' + exam.referral.urgency);
        console.log('    Status:    ' + exam.referral.status);
        const np = exam.referral.notes.length > 200 ? exam.referral.notes.substring(0, 200) + '...' : exam.referral.notes;
        console.log('    Notes:     ' + np);
      }
    }
    console.log('');
  }

  // Cross-check
  console.log('='.repeat(80));
  console.log('CROSS-CHECK: download_state exams vs DB exams');
  console.log('='.repeat(80));
  const allStateExams = [];
  for (const [examId, entry] of Object.entries(downloadState)) {
    if (entry.patient_name && entry.patient_name.toUpperCase().trim().includes('FRANCISCO SERGIO')) {
      allStateExams.push({ examId, ...entry });
    }
  }
  for (const stateExam of allStateExams) {
    const dbExam = await prisma.exam.findFirst({ where: { eyerCloudId: stateExam.examId } });
    if (dbExam) {
      console.log('  EyerCloud exam ' + stateExam.examId + ' -> DB exam ' + dbExam.id + ' (patient ' + dbExam.patientId + ') OK');
    } else {
      console.log('  *** EyerCloud exam ' + stateExam.examId + ' NOT FOUND in DB ***');
    }
  }

  console.log('\n=== Investigation complete ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
