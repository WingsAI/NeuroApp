#!/usr/bin/env python3
"""
Fetch all patient + exam + image data from EyerCloud and save to staging state file.

Uses the Sails.js WebSocket (io.socket) to call the
/exam/filter-20-last-with-examdata-and-params endpoint which returns
patients, exams, and images ALL in one paginated response.

Also fetches patient details from /patient/list HTTP API for extra fields
(CPF, gender, birthday, anamnesis) that may be more complete.

Usage:
    cd scripts/eyercloud_downloader
    python3 fetch_staging_data.py --email "user@example.com" --password "pass"
    python3 fetch_staging_data.py --email "user@example.com" --password "pass" --resume
    python3 fetch_staging_data.py --email "user@example.com" --password "pass" --patients-only
    python3 fetch_staging_data.py --email "user@example.com" --password "pass" --exams-only

Output: staging_state_{email_safe}.json
Next:   node scripts/import_staging_data.js --source <state_file> [--execute]
"""

import asyncio
import json
import re
import sys
import unicodedata
import argparse
from pathlib import Path
from datetime import datetime

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    sys.exit(1)

# --- Config ---
BASE_URL = "https://ec2.eyercloud.com"
PATIENT_API = "https://eyercloud.com/api/v2/eyercloud/patient/list"
# Exam endpoint is called via Sails WebSocket, not HTTP
EXAM_WS_PATH = "/api/v2/eyercloud/exam/filter-20-last-with-examdata-and-params"
PAGE_SIZE = 20


def sanitize_email(email):
    """Create safe filename from email."""
    return re.sub(r'[^a-zA-Z0-9]', '_', email.split('@')[0])


def normalize_name(name):
    """Normalize patient name: uppercase, remove accents, single spaces."""
    if not name:
        return ''
    name = name.upper().strip()
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = ' '.join(name.split())
    return name


def load_state(state_file):
    if state_file.exists():
        return json.loads(state_file.read_text(encoding='utf-8'))
    return {
        'email': '',
        'fetched_at': None,
        'patients': {},       # patient_id -> patient data
        'exams': {},          # exam_id -> exam data
        'exam_images': {},    # exam_id -> [image list]
    }


def save_state(state, state_file):
    state_file.write_text(
        json.dumps(state, indent=2, ensure_ascii=False, default=str),
        encoding='utf-8'
    )


async def login_eyercloud(page, email, password):
    """Login to EyerCloud and return True if successful."""
    print(f"Navigating to {BASE_URL}...")
    await page.goto(BASE_URL, timeout=60000)
    await asyncio.sleep(2)

    # Check if already logged in
    if '/exam' in page.url:
        print("Already logged in!")
        return True

    # Fill login form
    print(f"Logging in as {email}...")
    try:
        email_field = page.get_by_placeholder("Email")
        await email_field.fill(email)

        password_field = page.get_by_placeholder("Senha")
        await password_field.fill(password)
        await password_field.press("Enter")

        # Wait for redirect to exam page
        await page.wait_for_url("**/exam**", timeout=15000)
        print("Login successful!")
        return True
    except Exception as e:
        print(f"Login failed: {e}")
        print("Waiting 30s for manual login...")
        for i in range(30, 0, -1):
            print(f"  {i}s...", end='\r')
            await asyncio.sleep(1)
        if '/exam' in page.url or '/patient' in page.url:
            print("\nManual login detected!")
            return True
        return False


async def wait_for_sails_socket(page, timeout=30):
    """Wait until the Sails.js WebSocket is connected."""
    print("Waiting for Sails WebSocket connection...", end=' ')
    for i in range(timeout):
        is_connected = await page.evaluate("""
            () => {
                try {
                    const app = document.querySelector('#app')?.__vue_app__;
                    if (!app) return false;
                    const io = app.config.globalProperties.$io;
                    return io?.socket?.isConnected() || false;
                } catch(e) { return false; }
            }
        """)
        if is_connected:
            print("connected!")
            return True
        await asyncio.sleep(1)
    print("TIMEOUT!")
    return False


async def fetch_exams_via_socket(page, save_callback=None):
    """Fetch ALL exams via Sails WebSocket with pagination.

    Each exam includes full patient data + image list.
    Returns (exams_list, total_count).
    """
    print("\n=== Fetching Exams via Sails WebSocket ===")

    all_exams = []
    seen_ids = set()
    page_num = 1
    total_count = None

    while True:
        print(f"  Page {page_num}...", end=' ')

        try:
            result = await page.evaluate(f"""
                (pageNum) => {{
                    return new Promise((resolve, reject) => {{
                        const app = document.querySelector('#app').__vue_app__;
                        const socket = app.config.globalProperties.$io.socket;

                        socket.post(
                            '/api/v2/eyercloud/exam/filter-20-last-with-examdata-and-params',
                            {{
                                filter: {{
                                    startDate: null, endDate: null,
                                    patientID: null, patientFullName: null,
                                    properties: {{
                                        mcRas: false, color: false, redfree: false,
                                        infrared: false, segAnterior: false,
                                        panoramic: false, stereo: false
                                    }}
                                }},
                                page: pageNum
                            }},
                            (body, response) => {{
                                if (response.statusCode !== 200) {{
                                    resolve({{ error: response.statusCode, message: body?.error || 'Unknown error' }});
                                }} else {{
                                    // Serialize only what we need to avoid huge transfers
                                    const exams = (body.result || []).map(exam => {{
                                        const patient = exam.patient || {{}};
                                        const clinic = exam.clinic || {{}};
                                        const technician = exam.technician || {{}};
                                        const anamnesis = patient.anamnesis || {{}};

                                        return {{
                                            id: exam.id || exam._id,
                                            date: exam.date || '',
                                            status: exam.status || '',
                                            // Patient
                                            patient: {{
                                                id: patient.id || patient._id || '',
                                                fullName: (patient.fullName || '').trim(),
                                                firstName: (patient.firstName || '').trim(),
                                                lastName: (patient.lastName || '').trim(),
                                                gender: (patient.gender || '').trim(),
                                                birthday: (patient.birthday || '').trim(),
                                                cpf: (patient.document2 || '').trim(),
                                                phone: (patient.telephone1 || '').trim(),
                                                mrn: (patient.mrn || '').trim(),
                                                anamnesis: anamnesis,
                                                otherDisease: (patient.otherDisease || '').trim(),
                                            }},
                                            // Clinic
                                            clinicName: clinic.name || (typeof clinic === 'string' ? clinic : ''),
                                            clinicId: clinic.id || clinic._id || '',
                                            // Technician
                                            technicianName: technician.fullName || technician.name || '',
                                            // Images
                                            examImages: (exam.examImages || []).map(img => ({{
                                                uuid: img.uuid || '',
                                                type: (img.type || 'UNKNOWN').toUpperCase(),
                                                laterality: img.imageLaterality || img.laterality || '',
                                                parentsUUID: img.parentsUUID || '',
                                            }})),
                                        }};
                                    }});

                                    resolve({{
                                        totalCount: body.totalCount,
                                        count: exams.length,
                                        exams: exams,
                                    }});
                                }}
                            }}
                        );
                    }});
                }}
            """, page_num)

            if 'error' in result:
                print(f"ERROR {result.get('error')}: {result.get('message')}")
                break

            if total_count is None:
                total_count = result.get('totalCount', 0)
                print(f"(total: {total_count})", end=' ')

            exams = result.get('exams', [])
            if not exams:
                print("empty - done!")
                break

            new_count = 0
            for exam in exams:
                eid = exam.get('id', '')
                if eid and eid not in seen_ids:
                    seen_ids.add(eid)
                    all_exams.append(exam)
                    new_count += 1

            print(f"got {len(exams)} ({new_count} new, cumulative: {len(all_exams)})")

            if len(exams) < PAGE_SIZE:
                break

            page_num += 1
            await asyncio.sleep(0.3)

            # Save periodically
            if save_callback and page_num % 5 == 0:
                save_callback(all_exams)
                print(f"  --- Intermediate save ({len(all_exams)} exams) ---")

        except Exception as e:
            print(f"EXCEPTION: {e}")
            break

    print(f"Total unique exams fetched: {len(all_exams)} (expected: {total_count})")
    return all_exams, total_count or 0


async def fetch_all_patients(page):
    """Fetch all patients from /patient/list HTTP API with pagination.

    This supplements the patient data from exams with extra fields.
    """
    all_patients = []
    page_num = 1
    total_count = None

    print("\n=== Fetching Patient Details (HTTP API) ===")
    while True:
        print(f"  Page {page_num}...", end=' ')
        try:
            result = await page.evaluate(f"""
                async () => {{
                    const resp = await fetch('{PATIENT_API}', {{
                        method: 'POST',
                        credentials: 'include',
                        headers: {{'Content-Type': 'application/json'}},
                        body: JSON.stringify({{page: {page_num}}})
                    }});
                    if (!resp.ok) return {{ error: resp.status }};
                    return await resp.json();
                }}
            """)

            if isinstance(result, dict) and 'error' in result:
                print(f"ERROR {result['error']}")
                break

            patients = result.get('result', [])
            if total_count is None:
                total_count = result.get('totalCount', '?')
                print(f"(total: {total_count})", end=' ')

            if not patients:
                print("empty - done!")
                break

            all_patients.extend(patients)
            print(f"got {len(patients)} (cumulative: {len(all_patients)})")

            if len(patients) < PAGE_SIZE:
                break

            page_num += 1
            await asyncio.sleep(0.3)

        except Exception as e:
            print(f"EXCEPTION: {e}")
            break

    print(f"Total patients fetched: {len(all_patients)}")
    return all_patients


def process_patient_from_exam(exam):
    """Extract patient data from an exam response object."""
    pat = exam.get('patient', {}) or {}
    anamnesis = pat.get('anamnesis', {}) or {}

    full_name = pat.get('fullName', '') or ''
    if not full_name:
        first = pat.get('firstName', '') or ''
        last = pat.get('lastName', '') or ''
        full_name = f"{first} {last}".strip()

    return {
        'id': pat.get('id', ''),
        'rawName': full_name,
        'normalizedName': normalize_name(full_name),
        'cpf': pat.get('cpf', '') or pat.get('document2', ''),
        'gender': pat.get('gender', ''),
        'birthday': pat.get('birthday', ''),
        'phone': pat.get('phone', '') or pat.get('telephone1', ''),
        'prontuario': pat.get('mrn', ''),
        'cns': '',
        'anamnesis': anamnesis,
        'otherDisease': pat.get('otherDisease', ''),
        'underlyingDiseases': {
            'diabetes': anamnesis.get('diabetes', False),
            'hypertension': anamnesis.get('hipertensaoArterial', False) or anamnesis.get('hypertension', False),
            'cholesterol': anamnesis.get('hipercolesterolemia', False) or anamnesis.get('cholesterol', False),
            'smoker': anamnesis.get('tabagismo', False) or anamnesis.get('smoker', False),
        },
        'ophthalmicDiseases': {
            'cataract': anamnesis.get('catarata', False) or anamnesis.get('cataract', False),
            'glaucoma': anamnesis.get('glaucoma', False),
            'diabeticRetinopathy': anamnesis.get('retinopatia', False) or anamnesis.get('diabeticRetinopathy', False),
            'pterygium': anamnesis.get('pterygium', False),
            'dmri': anamnesis.get('dmri', False),
            'lowVisualAcuity': anamnesis.get('lowVisualAcuity', False),
        },
    }


def process_patient_from_api(pat):
    """Extract patient data from the /patient/list API response."""
    anamnesis = pat.get('anamnesis', {}) or {}
    return {
        'id': pat.get('id', ''),
        'rawName': (pat.get('fullName') or '').strip(),
        'normalizedName': normalize_name(pat.get('fullName', '')),
        'cpf': (pat.get('document2') or '').strip(),
        'gender': (pat.get('gender') or '').strip(),
        'birthday': (pat.get('birthday') or '').strip(),
        'phone': (pat.get('telephone1') or pat.get('phone') or '').strip(),
        'prontuario': (pat.get('mrn') or '').strip(),
        'cns': (pat.get('cns') or '').strip(),
        'anamnesis': anamnesis,
        'otherDisease': (pat.get('otherDisease') or '').strip(),
        'underlyingDiseases': {
            'diabetes': anamnesis.get('diabetes', False),
            'hypertension': anamnesis.get('hipertensaoArterial', False) or anamnesis.get('hypertension', False),
            'cholesterol': anamnesis.get('hipercolesterolemia', False) or anamnesis.get('cholesterol', False),
            'smoker': anamnesis.get('tabagismo', False) or anamnesis.get('smoker', False),
        },
        'ophthalmicDiseases': {
            'cataract': anamnesis.get('catarata', False) or anamnesis.get('cataract', False),
            'glaucoma': anamnesis.get('glaucoma', False),
            'diabeticRetinopathy': anamnesis.get('retinopatia', False) or anamnesis.get('diabeticRetinopathy', False),
            'pterygium': anamnesis.get('pterygium', False),
            'dmri': anamnesis.get('dmri', False),
            'lowVisualAcuity': anamnesis.get('lowVisualAcuity', False),
        },
    }


def process_exam(exam):
    """Extract exam fields from the socket response."""
    return {
        'id': exam.get('id', ''),
        'patientName': exam.get('patient', {}).get('fullName', ''),
        'patientId': exam.get('patient', {}).get('id', ''),
        'examDate': exam.get('date', ''),
        'clinicName': exam.get('clinicName', ''),
        'clinicId': exam.get('clinicId', ''),
        'technicianName': exam.get('technicianName', ''),
        'status': exam.get('status', ''),
    }


def process_images(exam):
    """Extract image list from exam, filtering out REDFREE."""
    images = []
    for img in exam.get('examImages', []):
        img_type = (img.get('type') or 'UNKNOWN').upper()
        if img_type == 'REDFREE':
            continue
        images.append({
            'uuid': img.get('uuid', ''),
            'type': img_type,
            'laterality': img.get('laterality', ''),
            'url': '',  # CDN URL not available from this endpoint
            'parentsUUID': img.get('parentsUUID', ''),
        })
    return images


def merge_patient_data(existing, new_data):
    """Merge patient data, preferring non-empty values from new_data."""
    for key in ['cpf', 'gender', 'birthday', 'phone', 'prontuario', 'cns', 'otherDisease']:
        new_val = new_data.get(key, '')
        if new_val and not existing.get(key, ''):
            existing[key] = new_val
    # Merge anamnesis - prefer new if existing is empty
    if new_data.get('anamnesis') and not existing.get('anamnesis'):
        existing['anamnesis'] = new_data['anamnesis']
    if new_data.get('underlyingDiseases'):
        if not existing.get('underlyingDiseases'):
            existing['underlyingDiseases'] = new_data['underlyingDiseases']
        else:
            # Merge: True overrides False
            for k, v in new_data['underlyingDiseases'].items():
                if v:
                    existing['underlyingDiseases'][k] = True
    if new_data.get('ophthalmicDiseases'):
        if not existing.get('ophthalmicDiseases'):
            existing['ophthalmicDiseases'] = new_data['ophthalmicDiseases']
        else:
            for k, v in new_data['ophthalmicDiseases'].items():
                if v:
                    existing['ophthalmicDiseases'][k] = True
    return existing


async def main():
    parser = argparse.ArgumentParser(description='Fetch EyerCloud data to staging')
    parser.add_argument('--email', required=True, help='EyerCloud login email')
    parser.add_argument('--password', required=True, help='EyerCloud password')
    parser.add_argument('--resume', action='store_true', help='Resume from saved state')
    parser.add_argument('--patients-only', action='store_true', help='Only fetch patients (HTTP API)')
    parser.add_argument('--exams-only', action='store_true', help='Only fetch exams via WebSocket (skip patient HTTP)')
    args = parser.parse_args()

    email_safe = sanitize_email(args.email)
    state_file = Path(f"staging_state_{email_safe}.json")
    auth_file = Path(f"auth_state_{email_safe}.json")

    print(f"=" * 60)
    print(f"  EyerCloud → Staging Fetcher (Sails WebSocket)")
    print(f"  Login: {args.email}")
    print(f"  State: {state_file}")
    print(f"  Auth:  {auth_file}")
    print(f"=" * 60)

    if args.resume and state_file.exists():
        state = load_state(state_file)
        print(f"Resuming: {len(state.get('patients', {}))} patients, {len(state.get('exams', {}))} exams")
    else:
        state = {
            'email': args.email,
            'fetched_at': None,
            'patients': {},
            'exams': {},
            'exam_images': {},
        }
    state['email'] = args.email

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if auth_file.exists():
            context = await browser.new_context(storage_state=str(auth_file))
            print("Using saved auth session")
        else:
            context = await browser.new_context()

        page = await context.new_page()

        # Login
        logged_in = await login_eyercloud(page, args.email, args.password)
        if not logged_in:
            print("FATAL: Could not login. Exiting.")
            await browser.close()
            sys.exit(1)

        # Save auth state
        await context.storage_state(path=str(auth_file))
        print("Auth state saved.\n")

        # Navigate to exam page and wait for Sails socket
        print("Navigating to exam page...")
        await page.goto(f"{BASE_URL}/exam", timeout=60000)
        await asyncio.sleep(3)

        socket_ready = await wait_for_sails_socket(page)
        if not socket_ready:
            print("FATAL: Sails WebSocket did not connect. Exiting.")
            await browser.close()
            sys.exit(1)

        # ===== Phase 1: Fetch exams + patients + images via WebSocket =====
        if not args.patients_only:
            def intermediate_save(exams_so_far):
                """Save intermediate state during exam fetch."""
                for exam in exams_so_far:
                    eid = exam.get('id', '')
                    if eid and eid not in state['exams']:
                        # Process patient
                        pat = process_patient_from_exam(exam)
                        if pat['id']:
                            if pat['id'] in state['patients']:
                                merge_patient_data(state['patients'][pat['id']], pat)
                            else:
                                state['patients'][pat['id']] = pat
                        # Process exam
                        state['exams'][eid] = process_exam(exam)
                        # Process images
                        state['exam_images'][eid] = process_images(exam)
                save_state(state, state_file)

            raw_exams, total_count = await fetch_exams_via_socket(page, save_callback=intermediate_save)

            # Process all fetched exams
            type_counts = {'COLOR': 0, 'ANTERIOR': 0, 'REDFREE_SKIPPED': 0, 'UNKNOWN': 0}

            for exam in raw_exams:
                eid = exam.get('id', '')
                if not eid:
                    continue

                # Patient
                pat = process_patient_from_exam(exam)
                if pat['id']:
                    if pat['id'] in state['patients']:
                        merge_patient_data(state['patients'][pat['id']], pat)
                    else:
                        state['patients'][pat['id']] = pat

                # Exam
                state['exams'][eid] = process_exam(exam)

                # Images (filter REDFREE)
                images = process_images(exam)
                state['exam_images'][eid] = images

                # Count types
                for img in images:
                    t = img['type']
                    if t in type_counts:
                        type_counts[t] += 1
                    else:
                        type_counts['UNKNOWN'] += 1

                # Count REDFREE that were filtered
                all_imgs = exam.get('examImages', [])
                redfree_count = sum(1 for img in all_imgs if (img.get('type') or '').upper() == 'REDFREE')
                type_counts['REDFREE_SKIPPED'] += redfree_count

            save_state(state, state_file)
            print(f"\nImage type distribution: {type_counts}")
            print(f"Saved {len(state['patients'])} patients, {len(state['exams'])} exams")

        # ===== Phase 2: Supplement patient data from HTTP API =====
        if not args.exams_only:
            raw_patients = await fetch_all_patients(page)

            supplemented = 0
            for pat_raw in raw_patients:
                processed = process_patient_from_api(pat_raw)
                pid = processed['id']
                if not pid:
                    continue
                if pid in state['patients']:
                    merge_patient_data(state['patients'][pid], processed)
                    supplemented += 1
                else:
                    state['patients'][pid] = processed

            save_state(state, state_file)
            print(f"Supplemented {supplemented} patients with HTTP API data")
            print(f"Total patients in state: {len(state['patients'])}")

        await browser.close()

    # Final save
    state['fetched_at'] = datetime.now().isoformat()
    save_state(state, state_file)

    # Summary
    total_images = sum(len(imgs) for imgs in state.get('exam_images', {}).values())
    patients_with_cpf = sum(1 for p in state.get('patients', {}).values() if p.get('cpf'))
    patients_with_gender = sum(1 for p in state.get('patients', {}).values() if p.get('gender'))
    patients_with_birthday = sum(1 for p in state.get('patients', {}).values() if p.get('birthday'))

    print(f"\n{'=' * 60}")
    print(f"  SUMMARY")
    print(f"{'=' * 60}")
    print(f"  Patients:    {len(state.get('patients', {}))}")
    print(f"    with CPF:      {patients_with_cpf}")
    print(f"    with gender:   {patients_with_gender}")
    print(f"    with birthday: {patients_with_birthday}")
    print(f"  Exams:       {len(state.get('exams', {}))}")
    print(f"  Total images (no REDFREE): {total_images}")
    print(f"  State file:  {state_file}")
    print(f"{'=' * 60}")
    print(f"\nNext step: node scripts/import_staging_data.js --source scripts/eyercloud_downloader/{state_file}")
    print(f"Then:      node scripts/import_staging_data.js --source scripts/eyercloud_downloader/{state_file} --execute")


if __name__ == '__main__':
    asyncio.run(main())
