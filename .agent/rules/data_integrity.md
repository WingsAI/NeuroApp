# Data Integrity Rules

These rules MUST be followed by ALL agents working on this codebase.

## IDs - CRITICAL

EyerCloud uses MongoDB ObjectIds (24 hex characters). **ALWAYS use the full 24-character ID.**

- **CORRECT:** `697001c6fa6df75200cfe287` (24 chars)
- **WRONG:** `697001c6` (8 chars - truncated, causes data corruption)

Rules:
1. `Patient.id` MUST be a 24-char hex EyerCloud ID (or `manual-*` for manually created)
2. `Exam.eyerCloudId` MUST be the full 24-char hex ID
3. **NEVER** truncate/substring IDs with `.substring(0, 8)` or similar
4. When creating patients from EyerCloud data, use the full `exam_id` from the mapping file
5. When looking up patients, search by full ID, not prefix

## Data Hierarchy

```
Patient (person)
  -> Exam (visit/exam, has eyerCloudId)
    -> ExamImage (photos, type: COLOR/ANTERIOR)
    -> MedicalReport (doctor's findings, 1:1 with exam)
    -> PatientReferral (referral, 1:1 with exam)
```

- One Patient can have MULTIPLE Exams (different visits/dates)
- Patient deduplication is by `name + birthDate` (case-insensitive, accent-normalized)
- Only `COLOR` and `ANTERIOR` image types are used

## Server Actions (app/actions/patients.ts)

- **updatePatientAction(id, updates)**: `id` can be Patient ID or Exam ID. Resolves exam via: exam.id -> exam.patientId -> exam.eyerCloudId. Patient fields (`cpf`, `phone`) update Patient record. Exam fields (`status`, `report`) go to updateExamAction.
- **createPatient(formData)**: Returns `{ id: exam.id, patientId: patient.id }`. The `id` is the EXAM id.
- **getPatientsAction()**: Promotes latest exam data to patient level for backwards compatibility.

When modifying actions:
1. Always `await checkAuth()` at the start of every exported action
2. Separate Patient-level fields (name, cpf, birthDate, gender, etc.) from Exam-level fields (status, examDate, location)
3. Always `revalidatePath` for all relevant routes after mutations

## NEVER Delete Reports

MedicalReports are signed medical documents - the most critical data.

- NEVER delete an Exam that has a MedicalReport
- NEVER delete a Patient that has exams with reports
- When consolidating duplicates, always keep the exam with the report
- When merging patients, preserve ALL report data

## Database Scripts

All database scripts MUST:
1. Have `--preview` mode (default) and `--execute` flag
2. Use `prisma.$transaction()` with adequate timeout (60s+) for multi-step ops
3. Log every change with patient name, old state, new state
4. NEVER call external APIs unless explicitly intended
5. Create a backup snapshot BEFORE destructive operations: `node scripts/backup_snapshot.js`

## Bytescale

- Usage-based billing. **NEVER** make Bytescale API calls or fetch URLs in scripts without explicit user authorization
- Bytescale URLs in the database are CDN links, safe to serve
- Use mapping JSON files for imports, not live API calls
