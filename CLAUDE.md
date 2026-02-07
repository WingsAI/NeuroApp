# NeuroApp - Agent Rules & Workflows

## Project Overview

NeuroApp is a medical ophthalmology platform for retinal exam screening. Built with Next.js 14 (App Router), Prisma ORM, PostgreSQL (Supabase), and deployed on Railway.

**Stack:** Next.js 14, React 18, TypeScript, Prisma, PostgreSQL, Supabase Auth, AWS S3, TailwindCSS

**Data source:** EyerCloud (Phelcom) with 456 exams and 451 patients. Images stored on Bytescale (legacy) and AWS S3 (primary).

**Current DB state (2026-02-07):** 402 patients, 470 exams (406 EyerCloud + 64 manual cml*), 4330 images (3011 COLOR + 1319 ANTERIOR), 186 reports. Snapshot at `scripts/db_snapshots/snapshot_2026-02-07_1352.json`.

## Critical Data Rules

### ID System - NEVER use short IDs

The EyerCloud system uses MongoDB ObjectIds (24 hex characters). **ALWAYS use the full 24-character ID.**

- **CORRECT:** `697001c6fa6df75200cfe287` (24 chars)
- **WRONG:** `697001c6` (8 chars - truncated, causes data corruption)

**Rules:**
1. Patient.id MUST be a 24-char hex EyerCloud ID (or `manual-*` / `cml*` for manually created patients)
2. Exam.eyerCloudId MUST be the full 24-char hex ID
3. NEVER truncate/substring IDs with `.substring(0, 8)` or similar
4. When creating new patients from EyerCloud data, the patient ID should be the full `exam_id` from the mapping file
5. When looking up patients, search by full ID, not prefix
6. The mapping file `bytescale_mapping_cleaned.json` has folder keys with short IDs (8 chars) - these are folder names, NOT exam IDs. Always use the `exam_id` field inside each entry, which is the full 24-char ID.

### Image Types from EyerCloud

The EyerCloud API returns three image types per exam:
- `COLOR` - Retinal fundus photos (keep)
- `ANTERIOR` - Anterior segment photos (keep)
- `REDFREE` - Red-free filtered images derived from COLOR (**ALWAYS filter out**)

The mapping file (`bytescale_mapping_cleaned.json`) does NOT have reliable type info - all images are typed as `UNKNOWN` or have no type field. **Never trust the `type` field in the mapping file.**

**To get real image types:**
1. Use `scripts/eyercloud_downloader/fetch_image_types.py` to query the EyerCloud API
2. This creates `image_types.json` mapping UUID -> type for every image
3. Use `scripts/fix_image_types.js` to apply types to the DB

**REDFREE images:**
- Every COLOR image has a corresponding REDFREE derived image
- REDFREE images have `parentsUUID` in their metadata pointing to the parent COLOR
- REDFREE timestamp is always +1ms after its parent COLOR image
- Roughly 41% of all EyerCloud images are REDFREE
- The `expected_images` count in `download_state.json` includes ALL types (COLOR + ANTERIOR + REDFREE)

### Mapping File Structure

`bytescale_mapping_cleaned.json` has 557 entries:
- 154 exam_ids have **2 entries each** (one with short-ID folder key, one with long-ID folder key)
- Both entries for the same exam have the same images uploaded to different Bytescale paths
- When importing, always use only **one entry per exam_id** (prefer the first/long-ID entry)
- The remaining ~249 exam_ids have 1 entry each

### Patient Deduplication

- Group by **normalized name only** (uppercase, accent-stripped, single-spaced)
- Do NOT use `name + birthDate` as the grouping key - patients without birthDate each become separate groups, creating duplicates
- Patient.id = the first exam's full 24-char EyerCloud ID for that patient
- When importing, always search for existing patients by normalized name first before creating new ones

### Data Hierarchy

```
Patient (person)
  -> Exam (visit/exam session, has eyerCloudId)
    -> ExamImage (individual photos, has type: COLOR/ANTERIOR)
    -> MedicalReport (doctor's findings, 1:1 with exam)
    -> PatientReferral (referral, 1:1 with exam)
```

- One Patient can have MULTIPLE Exams (different visits/dates)
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
3. Use `prisma.$transaction()` for multi-step operations (but see caveat below)
4. Log every change with patient name, old state, new state
5. NEVER call external APIs (Bytescale, EyerCloud) unless explicitly intended

**Prisma transaction caveat:** Interactive transactions have a default timeout of ~5s. Exams with 30+ images can exceed this. For bulk image operations, either:
- Use `deleteMany`/`updateMany` with ID arrays (preferred)
- Process operations individually without wrapping in a transaction
- Never loop with individual `delete`/`update` calls inside a `$transaction`

### Bytescale

- Bytescale has usage-based billing. NEVER make Bytescale API calls or fetch Bytescale URLs in scripts unless the user explicitly authorizes it
- Bytescale URLs in the database are fine to serve to users (they're CDN links)
- When importing data, use the mapping JSON files, not live API calls
- The user uploads images to Bytescale manually using `bytescale_uploader.py` (interactive, press Enter per page)

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
    bytescale_mapping_cleaned.json  # Image URLs (557 entries, type field unreliable)
    download_state.json             # Exam metadata from EyerCloud API (433 exams)
    image_types.json                # Real image types from API (UUID -> COLOR/ANTERIOR/REDFREE)
    fetch_image_types.py            # Fetches real image types from EyerCloud API
    downloader_playwright.py        # Downloads exam images from EyerCloud
    bytescale_uploader.py           # Uploads downloaded images to Bytescale (interactive)
  sync_eyercloud_full.js # Full sync: resolve IDs, import patients/exams/images
  fix_all_data.js        # Legacy sync (has bugs, see Known Issues below)
  fix_image_types.js     # Remove REDFREE images, fix ANTERIOR labels using image_types.json
  diagnose_db.js         # Database diagnostic
  db_snapshot.js         # Create JSON backup of all DB tables
  db_snapshots/          # JSON snapshots for restoration
  test_data_integrity.js # Data integrity test suite
types/
  index.ts               # TypeScript interfaces
```

## Common Workflows

### Adding new patients from EyerCloud (full pipeline)

1. Download exam data: `cd scripts/eyercloud_downloader && python downloader_playwright.py`
2. Upload images to Bytescale: `python bytescale_uploader.py` (interactive)
3. Fetch image types: `python fetch_image_types.py` (creates image_types.json)
4. Create DB snapshot: `node scripts/db_snapshot.js`
5. Sync to database: `node scripts/sync_eyercloud_full.js` (preview first, then `--execute`)
6. Fix image types: `node scripts/fix_image_types.js` (preview first, then `--execute`)
7. Verify: `node scripts/test_data_integrity.js`

### Fixing data issues

1. Always run `node scripts/diagnose_db.js` first to understand the state
2. Create a DB snapshot: `node scripts/db_snapshot.js`
3. Create a targeted fix script with `--preview` / `--execute` modes
4. Preview first, review output, then execute
5. Run tests: `node scripts/test_data_integrity.js`

### Signing Reports (Medical Page)

1. Doctor selects patient from list
2. System loads patient data via `getPatientsAction()`
3. `selectedPatient.id` is the Patient table primary key
4. On submit, calls `updatePatientAction(selectedPatient.id, { status, cpf, phone, report })`
5. The function resolves Patient ID -> latest Exam -> updates both Patient and Exam

## Known Issues & Lessons Learned (Feb 2026 Cleanup)

### Issues Found and Fixed

1. **Short ID corruption** (fixed in sync_eyercloud_full.js Phase 1-2)
   - **Cause:** `fix_all_data.js` line 221 used `patientData.exams[0]?.eyerCloudId` which was the short-ID from the mapping folder key
   - **Fix:** Resolved all 401 short IDs to full 24-char IDs by matching patient name + ID prefix against download_state.json
   - **Prevention:** Always validate IDs are 24 chars before writing to DB

2. **REDFREE images imported** (fixed with fix_image_types.js)
   - **Cause:** The mapping file marks all images as `UNKNOWN` type. The sync script defaulted UNKNOWN to COLOR, importing REDFREE duplicates
   - **Fix:** Fetched real types via EyerCloud API (fetch_image_types.py), then deleted 2892 REDFREE images
   - **Prevention:** Always run fetch_image_types.py + fix_image_types.js after importing new images

3. **Double mapping entries** (fixed with fix_duplicate_images.js)
   - **Cause:** 154 exams have 2 folder entries in the mapping (short-ID and long-ID folders). Both were imported, doubling images.
   - **Fix:** For each exam_id with 2 entries, removed images from the second entry (632 images)
   - **Prevention:** When importing from mapping, deduplicate by exam_id first (keep only one entry per exam_id)

4. **Patient deduplication by name+birthDate** (fixed in sync_eyercloud_full.js)
   - **Cause:** `fix_all_data.js` grouped by `normalizedName|birthDate`. Patients without birthDate each got unique key `NAME|unknown`, creating duplicates
   - **Fix:** Group by normalized name only
   - **Prevention:** Use name-only grouping for patient deduplication

5. **Prisma transaction timeout** (worked around in cleanup_remaining_short_exams.js)
   - **Cause:** Exams with 30+ images exceeded Prisma interactive transaction default timeout when deleting/moving images one by one
   - **Fix:** Used individual operations without transaction wrapper, or batch operations with `deleteMany`/`updateMany`
   - **Prevention:** Use `deleteMany({ where: { id: { in: ids } } })` for bulk operations

### fix_all_data.js Known Bugs (DO NOT USE without fixes)

This script has several issues that caused the data corruption:
1. Uses short IDs from mapping folder keys as patient IDs (line 221)
2. Defaults image type to `'COLOR'` when mapping says `UNKNOWN` (line 294) - imports REDFREE
3. Groups patients by name+birthDate, creating duplicates for patients without birthDate (line 148)
4. Does not deduplicate mapping entries per exam_id, importing images twice (line 283)
5. Does not look up existing patients by name, always upserts by ID (creates duplicates)

**Use `sync_eyercloud_full.js` instead** - it fixes all of these issues.

## Language

- Code: English
- UI: Portuguese (Brazilian)
- Commit messages: Portuguese or English (mixed is OK)
- Variable names: English
