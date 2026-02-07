# NeuroApp - Agent Rules & Workflows

## Project Overview

NeuroApp is a medical ophthalmology platform for retinal exam screening. Built with Next.js 14 (App Router), Prisma ORM, PostgreSQL (Supabase), and deployed on Railway.

**Stack:** Next.js 14, React 18, TypeScript, Prisma, PostgreSQL, Supabase Auth, AWS S3, TailwindCSS

**Data source:** EyerCloud (Phelcom) with 456 exams and 451 patients. Images stored on Bytescale (legacy) and AWS S3 (primary).

## Critical Data Rules

### ID System - NEVER use short IDs

The EyerCloud system uses MongoDB ObjectIds (24 hex characters). **ALWAYS use the full 24-character ID.**

- **CORRECT:** `697001c6fa6df75200cfe287` (24 chars)
- **WRONG:** `697001c6` (8 chars - truncated, causes data corruption)

**Rules:**
1. Patient.id MUST be a 24-char hex EyerCloud ID (or `manual-*` for manually created patients)
2. Exam.eyerCloudId MUST be the full 24-char hex ID
3. NEVER truncate/substring IDs with `.substring(0, 8)` or similar
4. When creating new patients from EyerCloud data, the patient ID should be the full `exam_id` from the mapping file
5. When looking up patients, search by full ID, not prefix

### Image Types

Only two image types are used from EyerCloud:
- `COLOR` - Retinal fundus photos
- `ANTERIOR` - Anterior segment photos

Filter out `UNKNOWN` type images when importing.

### Data Hierarchy

```
Patient (person)
  -> Exam (visit/exam session, has eyerCloudId)
    -> ExamImage (individual photos, has type: COLOR/ANTERIOR)
    -> MedicalReport (doctor's findings, 1:1 with exam)
    -> PatientReferral (referral, 1:1 with exam)
```

- One Patient can have MULTIPLE Exams (different visits/dates)
- Patient deduplication is by `name + birthDate` (case-insensitive, accent-normalized)
- A Patient is identified by their first exam's full EyerCloud ID

### Server Actions (app/actions/patients.ts)

**updatePatientAction(id, updates):**
- The `id` parameter can be a Patient ID OR an Exam ID (compatibility layer)
- It resolves the exam via: exam.id -> exam.patientId -> exam.eyerCloudId
- Patient-level fields (`cpf`, `phone`) are updated on the Patient record
- Exam-level fields (`status`, `report`, `referral`) are delegated to updateExamAction
- MUST always call `checkAuth()` first

**createPatient(formData):**
- Returns `{ success: true, id: exam.id, patientId: patient.id }`
- The `id` in the response is the EXAM id, not the patient id
- Patient lookup is by `name + birthDate`

**getPatientsAction():**
- Returns patients with retrocompatibility: promotes latest exam data to patient level
- `patient.id` is the Patient table ID
- `patient.status`, `patient.images`, `patient.report` come from the latest exam

### When Modifying Data Actions

1. Always include `await checkAuth()` at the start of every exported server action
2. When updating, distinguish between Patient-level fields and Exam-level fields
3. Patient fields: `name`, `cpf`, `birthDate`, `gender`, `ethnicity`, `education`, `occupation`, `phone`, `ophthalmicDiseases`, `underlyingDiseases`
4. Exam fields: `status`, `examDate`, `location`, `technicianName`
5. Related records: `report` -> MedicalReport, `referral` -> PatientReferral, `images` -> ExamImage
6. Always `revalidatePath` for all relevant routes after mutations

## Database Safety Rules

### NEVER delete data with reports

MedicalReports are the most critical data in the system. They represent signed medical documents.

- NEVER delete an Exam that has a MedicalReport
- NEVER delete a Patient that has exams with reports
- When consolidating duplicates, always keep the exam with the report
- When merging patients, preserve ALL report data

### Script Safety

All database scripts MUST:
1. Have a `--preview` mode (default) that only reads and reports
2. Have an `--execute` flag required to make changes
3. Use `prisma.$transaction()` for multi-step operations
4. Log every change with patient name, old state, new state
5. NEVER call external APIs (Bytescale, EyerCloud) unless explicitly intended

### Bytescale

- Bytescale has usage-based billing. NEVER make Bytescale API calls or fetch Bytescale URLs in scripts unless the user explicitly authorizes it
- Bytescale URLs in the database are fine to serve to users (they're CDN links)
- When importing data, use the mapping JSON files, not live API calls

## File Structure

```
app/
  actions/patients.ts    # All server actions (CRUD)
  medical/page.tsx       # Doctor's analysis terminal (sign reports)
  results/page.tsx       # View signed reports & results
  referrals/page.tsx     # Patient referrals
  analytics/page.tsx     # Dashboard analytics
  register/page.tsx      # New patient registration
components/
  Navbar.tsx             # Navigation
lib/
  prisma.ts              # Prisma client singleton
  s3.ts                  # AWS S3 upload/signed URLs
  supabase-*.ts          # Supabase auth clients
prisma/
  schema.prisma          # Database schema
scripts/
  eyercloud_downloader/  # Python scripts for EyerCloud data
    bytescale_mapping_cleaned.json  # Source of truth for EyerCloud data
    download_state.json             # Full exam metadata from EyerCloud
  cleanup_and_fix.js     # Database cleanup (short IDs, duplicates)
  diagnose_db.js         # Database diagnostic
  fix_all_data.js        # Sync mapping -> database
types/
  index.ts               # TypeScript interfaces
```

## Common Workflows

### Adding new patients from EyerCloud

1. Download data via Python scripts in `scripts/eyercloud_downloader/`
2. Update `bytescale_mapping_cleaned.json` with new entries
3. Run `node scripts/fix_all_data.js` (preview first, then `--execute`)
4. Verify with `node scripts/diagnose_db.js`

### Fixing data issues

1. Always run `node scripts/diagnose_db.js` first to understand the state
2. Create a targeted fix script with `--preview` / `--execute` modes
3. Preview first, review output, then execute
4. Run diagnose again to verify

### Signing Reports (Medical Page)

1. Doctor selects patient from list
2. System loads patient data via `getPatientsAction()`
3. `selectedPatient.id` is the Patient table primary key
4. On submit, calls `updatePatientAction(selectedPatient.id, { status, cpf, phone, report })`
5. The function resolves Patient ID -> latest Exam -> updates both Patient and Exam

## Language

- Code: English
- UI: Portuguese (Brazilian)
- Commit messages: Portuguese or English (mixed is OK)
- Variable names: English
