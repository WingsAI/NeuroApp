# NeuroApp - Agent Rules & Workflows

## Project Overview

NeuroApp is a medical ophthalmology platform for retinal exam screening. Built with Next.js 14 (App Router), Prisma ORM, PostgreSQL (Supabase), and deployed on Railway.

**Stack:** Next.js 14, React 18, TypeScript, Prisma, PostgreSQL, Supabase Auth, Bytescale, TailwindCSS

**Data source:** EyerCloud (Phelcom) with 456 exams and 451 patients. Images stored on Bytescale.

**Current DB state (2026-02-09):** 449 patients, 455 exams (391 EyerCloud + 64 manual CML), 6340 images, 381 reports, 415 patients with diseases. All 83 duplicate exams consolidated. 448 patients with birth dates (99.8%). All exam locations corrected (204 Jaci-SP, 95 Campos do Jordão-SP, 156 Tauá-CE). Snapshot at `scripts/db_snapshots/snapshot_2026-02-09_1626.json`.

**EyerCloud coverage:** 455 of 456 exam IDs accounted for (454 direct + 1 via CML exam eyerCloudId). 1 exam ID not yet captured in data sources. 64 CML exams are manual duplicates of EyerCloud exams (all have eyerCloudId set).

**Exam periods by location:**
- Until 15/01: Tauá-CE (156 exams)
- 27-30/01: Jaci-SP (204 exams)
- 02-05/02: Campos do Jordão-SP (95 exams, including 67 that had clinic ID `695e434f28b781ee6000d862` corrected)

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
- Patient-level fields (`cpf`, `phone`, `underlyingDiseases`, `ophthalmicDiseases`) are updated on the Patient record
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
    bytescale_mapping_cleaned.json  # Image URLs for first 402 patients (557 entries, type field unreliable)
    bytescale_mapping_v2.json       # Image URLs for ALL patients including 48 new (605 entries, has image type)
    download_state.json             # Exam metadata from EyerCloud API (455 exams, 449 unique patients)
    image_types.json                # Real image types from API (UUID -> COLOR/ANTERIOR/REDFREE)
    fetch_image_types.py            # Fetches real image types from EyerCloud API
    fetch_anamnesis.py              # Fetches patient disease/anamnesis data from EyerCloud patient/list API
    fetch_patient_details.py        # Fetches CPF, gender, birthday from EyerCloud patient/list API (creates patient_details.json)
    patient_details.json            # Full patient details from EyerCloud (CPF, gender, birthday, anamnesis)
    anamnesis_data.json             # Raw anamnesis data from EyerCloud (451 patients)
    downloader_playwright.py        # Downloads exam images from EyerCloud (all pages)
    download_missing_48.py          # Downloads the 48 missing exams by ID (targeted)
    bytescale_uploader.py           # Uploads downloaded images to Bytescale (interactive)
  missing_47_patients.json  # 47 patients (48 exams) found on EyerCloud but not in DB
  eyercloud_site_patients.json  # All 451 patient names from EyerCloud site
  compare_site_vs_db.js    # Compare EyerCloud site patients vs state vs DB
  fix_desconhecido.js      # Fix 26 "Desconhecido" patient names in download_state
  sync_eyercloud_full.js   # Full sync: resolve IDs, import patients/exams/images
  fix_all_data.js        # Legacy sync (has bugs, see Known Issues below)
  fix_image_types.js     # Remove REDFREE images, fix ANTERIOR labels using image_types.json
  fix_diseases.js        # Sync disease data from download_state.json anamnesis to DB
  fix_cpf_gender.js      # Sync CPF/gender from patient_details.json, normalize gender to Portuguese
  fix_duplicate_cml_status.js  # Mark duplicate CML exams as completed
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
4. Fetch disease data: `python fetch_anamnesis.py` (requires manual login, updates download_state.json)
5. Fetch patient details (CPF, gender): `python fetch_patient_details.py` (requires manual login, creates patient_details.json)
6. Create DB snapshot: `node scripts/db_snapshot.js`
7. Sync to database: `node scripts/sync_eyercloud_full.js` (preview first, then `--execute`)
8. Fix image types: `node scripts/fix_image_types.js` (preview first, then `--execute`)
9. Sync diseases: `node scripts/fix_diseases.js` (preview first, then `--execute`)
10. Sync CPF/gender: `node scripts/fix_cpf_gender.js` (preview first, then `--execute`)
11. Verify: `node scripts/test_data_integrity.js`

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

### Feb 2026 - Missing 47 Patients Discovery

6. **26 "Desconhecido" exams were real patients** (fixed with fix_desconhecido.js)
   - **Cause:** `downloader_playwright.py` downloaded some exams without patient names (patient field was a string or missing), registering them as "Desconhecido" in download_state.json
   - **Fix:** Fetched all 451 patient names and 456 exam IDs from EyerCloud via browser API (`POST {page: N}`). Matched 26 Desconhecido exams to real patient names.
   - **Prevention:** When patient_obj is not a dict, handle gracefully. Always add `isinstance()` guards before `.get()`.

7. **47 patients never downloaded** (fixed with download_missing_48.py)
   - **Cause:** The downloader runs page by page through the exam list. 47 patients (48 exams) were on EyerCloud pages that were never reached or skipped.
   - **Discovery:** Compared 451 site patient names vs 402 state patient names using `compare_site_vs_db.js`.
   - **Fix:** Created targeted `download_missing_48.py` that downloads only the 48 specific exam IDs. Downloads only COLOR+ANTERIOR (no REDFREE).
   - **Note:** 26 of the 48 overlapped with the Desconhecido exams (same exam ID), but those only had metadata, no images.

8. **EyerCloud API pagination quirk**
   - The exam list API uses `{page: N}` NOT `{examCurrentPage: N}` for real pagination
   - `{examCurrentPage: N}` always returns the same first page regardless of value
   - The patient list API also uses `{page: N}` - confirmed via XHR interception
   - Both APIs are POST to `https://eyercloud.com/api/v2/eyercloud/{exam|patient}/list`
   - `fetch()` with `credentials: 'include'` works from the browser context, but `XMLHttpRequest` without `withCredentials` does not (returns `notAuthenticated`)

### Mapping Files

- **`bytescale_mapping_cleaned.json`** (557 entries): First 402 patients. Image type field is UNRELIABLE (all UNKNOWN). Used by `sync_eyercloud_full.js`.
- **`bytescale_mapping_v2.json`** (605 entries): ALL patients including 48 new. Generated by `bytescale_uploader.py`. Image type field is also UNKNOWN. Use `image_types.json` or `download_state.json` `image_details` for real types.
- When importing new patients, prefer `bytescale_mapping_v2.json` as it has all entries.
- The 48 new exams have `image_details` in `download_state.json` with correct types (COLOR/ANTERIOR only, no REDFREE).

### Feb 2026 - Disease Data & Report Fixes (2026-02-08)

9. **Disease/comorbidity data was all false** (fixed with fetch_anamnesis.py + fix_diseases.js)
   - **Cause:** EyerCloud's root-level patient fields (`diabetes`, `hypertension`, etc.) are always `false`. The real disease data is inside `patient.anamnesis` (a nested object returned only by the `POST /patient/list` API).
   - **Discovery:** Checked individual patient records (e.g., MARGARIDA APARECIDA DE LIMA had hypertension+cholesterol on the EyerCloud UI but all false in API root fields). Manual browser fetch of `/patient/list` revealed `anamnesis` field with correct data.
   - **Fix:** Rewrote `fetch_anamnesis.py` to use `POST /patient/list` with pagination. Created `fix_diseases.js` to sync anamnesis data to DB.
   - **Result:** 414 patients updated, 415 now have at least one disease flag.
   - **Key API detail:** `POST /examData/list?id=EXAM_ID` returns images/exam data (not patient data). `POST /patient/list` with `{page: N}` returns patient objects with `anamnesis` field containing the real disease flags.

10. **Cloud mapping phantoms in pending list** (fixed in medical/page.tsx)
    - **Cause:** `loadPatients` merged DB patients with cloud mapping entries. 382 mapping entries had short 8-char IDs (folder keys without `exam_id` field), which didn't match any DB patient IDs. These appeared as phantom pending patients.
    - **Fix:** Added name-based matching when merging cloud patients: `existingDbPatient = dbPatients.find(p => p.id === patientId || p.name?.toUpperCase().trim() === data.patient_name?.toUpperCase().trim())`. Also added name-based dedup filter for cloud-only patients.
    - **Prevention:** Always match cloud mapping entries by both ID and normalized name.

11. **selectedImages ID mismatch in results page** (fixed in results/page.tsx)
    - **Cause:** Doctors selected images when the UI showed cloud mapping images (ID format `examId-N` or `cml...-N`). DB images were later replaced with S3 uploads (ID format `img-UUID.jpg`). Reports stored the old IDs, so images appeared broken on results page.
    - **Affected:** 105 reports with broken selectedImages references.
    - **Fix:** Added `resolveImage()` function with 3-tier fallback: (1) exact ID match in exam images, (2) search across all patient exams, (3) extract index from ID suffix `-N` and use positional match.
    - **Prevention:** When replacing image sources (e.g., Bytescale -> S3), update `selectedImages` references in reports too.

12. **CML duplicate exams appearing in both pending and completed lists** (fixed with fix_duplicate_cml_status.js)
    - **Cause:** 64 CML exams are manual duplicates of EyerCloud exams. When a doctor completed the EyerCloud exam, the CML duplicate stayed `pending`, causing the patient to appear in both lists.
    - **Affected:** 34 patients appeared in both pending and completed lists.
    - **Fix:** Script finds patients with both completed and pending exams, marks all pending duplicates as completed.
    - **Prevention:** When completing an exam, consider marking all exams for the same patient as completed.

13. **Report save navigation** (fixed in medical/page.tsx)
    - **Cause:** After saving a report, the page reloaded the patient list instead of navigating away, keeping the patient in the pending list view.
    - **Fix:** Changed to `router.push('/results')` after successful save.

### Feb 2026 - Missing Images & Duplicate Cleanup (2026-02-09)

14. **895 images uploaded to Bytescale but missing from DB** (fixed with fix_missing_mapped_images.js)
    - **Cause:** Images were uploaded to Bytescale and recorded in `bytescale_mapping_v2.json`, but never imported to DB or were deleted during cleanup operations.
    - **Affected:** 156 exams had partial or missing images. Francisco Elivan had 0 images despite 3 being uploaded.
    - **Fix:** Script compares DB images vs mapping by URL, adds missing images with UUID-based IDs.
    - **Result:** 895 images restored (4726 → 5621 → 5175 after dedup consolidation).
    - **Prevention:** Always verify DB import after Bytescale upload. Check `bytescale_mapping_v2.json` vs DB regularly.

15. **63 duplicate exams (same eyerCloudId)** (fixed with fix_duplicate_exams.js)
    - **Cause:** Cloud mapping and CML imports created duplicate exams for the same eyerCloudId within a patient.
    - **Affected:** 63 patients had 2 exams with identical eyerCloudId and images.
    - **Fix:** Script keeps the "best" exam (has report > more images > completed status > oldest), deletes duplicates.
    - **Result:** 63 exams deleted (518 → 455 exams).
    - **Prevention:** Deduplicate by eyerCloudId before import. Check for existing exams when importing from new sources.

16. **131 patients with null birth dates** (fixed with fetch_birth_dates.py + fix_null_birth_dates.js)
    - **Issue:** 131 patients (29% of total) had `birthDate: null` in DB. `download_state.json` had empty `birthday: ""` field for all affected patients.
    - **Cause:** The `downloader_playwright.py` script doesn't fetch the `birthday` field from EyerCloud API. The field exists in `POST /patient/list` response but wasn't being captured.
    - **Affected:** Margarida Inácio Santos do Prado (06/07/1955), Ivan Lúcio de Lima (26/06/1980), and 129 others.
    - **Fix:** Created `fetch_birth_dates.py` using `POST /patient/list` API to fetch birth dates from EyerCloud, then `fix_null_birth_dates.js` to sync to DB.
    - **Result:** 130 patients updated with birth dates. Only 1 patient (Nayara Petrola) has no birth date in EyerCloud.
    - **Prevention:** Run `fetch_birth_dates.py` after downloading new patients to populate birth dates.

17. **67 exams with clinic ID instead of name** (fixed with fix_strange_locations.js + correct_jaci_to_cdjordao.js)
    - **Issue:** 67 exams had `location: "695e434f28b781ee6000d862"` (clinic_id) instead of city name.
    - **Cause:** EyerCloud API returned clinic ID instead of `clinic_name` for some exams during download. The `download_state.json` stored the ID as-is.
    - **Affected:** 67 exams from 03-05/02 (Campos do Jordão-SP period).
    - **Fix:** Created mapping `695e434f28b781ee6000d862 -> Campos do Jordão-SP` based on exam dates (03-05/02). Script corrects all occurrences.
    - **Result:** All 67 exams corrected to `location: "Campos do Jordão-SP"`. Final distribution: 204 Jaci-SP, 95 Campos do Jordão-SP, 156 Tauá-CE.
    - **Prevention:** Add clinic ID-to-name mapping in future imports. Validate location field is not a 24-char hex ID.

18. **CPF and gender missing for most patients** (fixed with fetch_patient_details.py + fix_cpf_gender.js)
    - **Cause:** The exam endpoint (`/examData/list?id=EXAM_ID`) does NOT reliably return CPF and gender. The patient endpoint (`/patient/list`) has the complete data, but the existing scripts (`fetch_anamnesis.py`, `fetch_birth_dates.py`) only extracted disease and birthday fields — not CPF or gender.
    - **Affected:** 143 patients with null gender, all 306 with gender had `"male"`/`"female"` (English, from EyerCloud) instead of `"Masculino"`/`"Feminino"` (Portuguese, expected by UI). CPF missing for patients where exam endpoint didn't return it.
    - **Fix:** Created `fetch_patient_details.py` to fetch ALL patient fields (CPF, gender, birthday, anamnesis) from patient endpoint. Created `fix_cpf_gender.js` to sync to DB and normalize gender values to Portuguese (`male`->`Masculino`, `female`->`Feminino`).
    - **Gender display bug:** `medical/page.tsx` line 889 compared `gender === 'F'` / `'M'` but DB had `'female'` / `'male'`, causing ALL patients to show as "Outro". Fixed to handle all formats.
    - **Prevention:** Always use the PATIENT endpoint (`/patient/list`) for patient demographics (CPF, gender, birthday). The EXAM endpoint is only reliable for exam data (images, dates). When storing gender, always normalize to Portuguese values used by the UI.

### EyerCloud API Reference

- **Patient list:** `POST https://eyercloud.com/api/v2/eyercloud/patient/list` with body `{page: N}` (20 per page)
  - Returns patient objects with: `id`, `fullName`, `cpf`, `gender` (`"male"`/`"female"`), `birthday`, `anamnesis`, `otherDisease`
  - `anamnesis` fields: `diabetes`, `hipertensaoArterial`, `hipercolesterolemia`, `tabagismo`, `catarata`, `retinopatia`, `glaucoma`
  - **This is the ONLY reliable source for CPF and gender.** The exam endpoint does NOT return these fields consistently.
- **Exam list:** `POST https://eyercloud.com/api/v2/eyercloud/exam/list` with body `{page: N}`
- **Exam data:** `POST https://eyercloud.com/api/v2/eyercloud/examData/list?id=EXAM_ID` - returns images, NOT patient data. Does NOT reliably include CPF or gender.
- **Auth:** Requires browser session cookies. Use Playwright with `headless=False` and manual login (15s delay)
- **Pagination:** Always use `{page: N}`, NOT `{examCurrentPage: N}` (the latter is broken)

## Language

- Code: English
- UI: Portuguese (Brazilian)
- Commit messages: Portuguese or English (mixed is OK)
- Variable names: English
