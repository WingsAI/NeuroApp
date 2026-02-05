
-- Cria tabela Exam
CREATE TABLE IF NOT EXISTS "Exam" (
    "id" TEXT NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eyerCloudId" TEXT,
    "patientId" TEXT NOT NULL,
    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);
    

-- Cria tabela ExamImage
CREATE TABLE IF NOT EXISTS "ExamImage" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "type" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "examId" TEXT NOT NULL,
    CONSTRAINT "ExamImage_pkey" PRIMARY KEY ("id")
);
    

-- Adiciona foreign keys
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_patientId_fkey" 
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExamImage" ADD CONSTRAINT "ExamImage_examId_fkey" 
    FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    

-- Migra dados: cada Patient antigo vira um Exam
INSERT INTO "Exam" ("id", "examDate", "location", "technicianName", "status", "createdAt", "patientId")
SELECT 
    "id", 
    "examDate", 
    "location", 
    COALESCE("technicianName", 'EyerCloud Sync'),
    COALESCE("status", 'pending'),
    "createdAt",
    "id"
FROM "Patient";
    

-- Migra imagens de PatientImage para ExamImage
INSERT INTO "ExamImage" ("id", "url", "fileName", "type", "uploadedAt", "examId")
SELECT "id", "url", "fileName", "type", "uploadedAt", "patientId"
FROM "PatientImage";
    

-- Adiciona coluna examId ao MedicalReport
ALTER TABLE "MedicalReport" ADD COLUMN IF NOT EXISTS "examId" TEXT;

-- Copia patientId para examId (já que 1 patient antigo = 1 exam)
UPDATE "MedicalReport" SET "examId" = "patientId";
    

-- Adiciona coluna examId ao PatientReferral
ALTER TABLE "PatientReferral" ADD COLUMN IF NOT EXISTS "examId" TEXT;

-- Copia patientId para examId
UPDATE "PatientReferral" SET "examId" = "patientId";
    