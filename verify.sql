SELECT 'Exam' as tabela, count(*) as total FROM "Exam"
UNION ALL
SELECT 'ExamImage', count(*) FROM "ExamImage"
UNION ALL
SELECT 'MedicalReport com examId', count(*) FROM "MedicalReport" WHERE "examId" IS NOT NULL;
