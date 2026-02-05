SELECT count(*) as total FROM "Patient";
SELECT count(*) as synced FROM "Patient" WHERE "technicianName" = 'EyerCloud Sync';
SELECT count(*) as images FROM "PatientImage";
