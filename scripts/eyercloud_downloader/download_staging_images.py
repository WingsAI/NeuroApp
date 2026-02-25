#!/usr/bin/env python3
"""
Download images from EyerCloud staging accounts (Melina, Mozania).

Combines fetch_staging_data.py (metadata via Sails WebSocket) with
download_missing_48.py (image download via CDN) into a single script.

Pipeline:
  1. Login to EyerCloud account
  2. Fetch all exams via Sails WebSocket (paginated)
  3. For each exam, fetch image details via /examData/list API
  4. Download COLOR + ANTERIOR images (skip REDFREE)
  5. Save state for resume capability
  6. Also generates staging_state JSON for DB import

Usage:
    cd scripts/eyercloud_downloader
    python download_staging_images.py --email "dramelinalannes.endocrino@gmail.com" --password "xxx"
    python download_staging_images.py --email "dramelinalannes.endocrino@gmail.com" --password "xxx" --resume
    python download_staging_images.py --email "mozaniareis@usp.br" --password "xxx"

Output:
    downloads_staging/{email_safe}/PATIENT_EXAMID/UUID.jpg
    staging_state_{email_safe}.json
    staging_download_state_{email_safe}.json  (download progress tracker)
"""

import asyncio
import json
import os
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

try:
    import requests
except ImportError:
    print("pip install requests")
    sys.exit(1)

# --- Config ---
BASE_URL = "https://ec2.eyercloud.com"
PATIENT_API = "https://eyercloud.com/api/v2/eyercloud/patient/list"
PAGE_SIZE = 20


def sanitize_email(email):
    return re.sub(r'[^a-zA-Z0-9]', '_', email.split('@')[0])


def normalize_name(name):
    if not name:
        return ''
    name = name.upper().strip()
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = ' '.join(name.split())
    return name


def safe_folder_name(patient_name, exam_id):
    safe = re.sub(r'[<>:"/\\|?*]', '_', patient_name).replace(' ', '_')
    return f"{safe}_{exam_id[:8]}"


def load_json(path):
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    return None


def save_json(data, path):
    path.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, default=str),
        encoding='utf-8'
    )


async def login_eyercloud(page, email, password, auth_file):
    """Login to EyerCloud. Returns True if successful."""
    print(f"Navigating to {BASE_URL}...")
    await page.goto(BASE_URL, timeout=60000)
    await asyncio.sleep(2)

    if '/exam' in page.url:
        print("Already logged in!")
        return True

    print(f"Logging in as {email}...")
    try:
        await page.get_by_placeholder("Email").fill(email)
        pw_field = page.get_by_placeholder("Senha")
        await pw_field.fill(password)
        await pw_field.press("Enter")
        await page.wait_for_url("**/exam**", timeout=15000)
        print("Login successful!")
        return True
    except Exception as e:
        print(f"Auto-login failed: {e}")
        print("Please login manually in the browser...")
        print("Press ENTER here after login.")
        await asyncio.get_event_loop().run_in_executor(None, input, ">>> ")
        if '/exam' in page.url or '/patient' in page.url:
            print("Manual login detected!")
            return True
        return False


async def wait_for_sails_socket(page, timeout=30):
    """Wait until Sails.js WebSocket is connected."""
    print("Waiting for Sails WebSocket...", end=' ')
    for _ in range(timeout):
        connected = await page.evaluate("""
            () => {
                try {
                    const app = document.querySelector('#app')?.__vue_app__;
                    if (!app) return false;
                    return app.config.globalProperties.$io?.socket?.isConnected() || false;
                } catch(e) { return false; }
            }
        """)
        if connected:
            print("connected!")
            return True
        await asyncio.sleep(1)
    print("TIMEOUT!")
    return False


async def fetch_all_exam_ids_via_socket(page):
    """Fetch ALL exam IDs + basic info via Sails WebSocket pagination.
    Returns list of {id, patient_name, patient_id, image_count}."""
    print("\n=== Phase 1: Fetching exam list via Sails WebSocket ===")

    all_exams = []
    seen_ids = set()
    page_num = 1
    total_count = None

    while True:
        print(f"  Page {page_num}...", end=' ')
        try:
            result = await page.evaluate("""
                (pageNum) => {
                    return new Promise((resolve, reject) => {
                        const app = document.querySelector('#app').__vue_app__;
                        const socket = app.config.globalProperties.$io.socket;
                        socket.post(
                            '/api/v2/eyercloud/exam/filter-20-last-with-examdata-and-params',
                            {
                                filter: {
                                    startDate: null, endDate: null,
                                    patientID: null, patientFullName: null,
                                    properties: {
                                        mcRas: false, color: false, redfree: false,
                                        infrared: false, segAnterior: false,
                                        panoramic: false, stereo: false
                                    }
                                },
                                page: pageNum
                            },
                            (body, response) => {
                                if (response.statusCode !== 200) {
                                    resolve({ error: response.statusCode });
                                } else {
                                    const exams = (body.result || []).map(exam => {
                                        const patient = exam.patient || {};
                                        const anamnesis = patient.anamnesis || {};
                                        const clinic = exam.clinic || {};
                                        const technician = exam.technician || {};
                                        return {
                                            id: exam.id || exam._id,
                                            date: exam.date || '',
                                            status: exam.status || '',
                                            patient: {
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
                                            },
                                            clinicName: clinic.name || (typeof clinic === 'string' ? clinic : ''),
                                            clinicId: clinic.id || clinic._id || '',
                                            technicianName: technician.fullName || technician.name || '',
                                            imageCount: (exam.examImages || []).length,
                                            examImages: (exam.examImages || []).map(img => ({
                                                uuid: img.uuid || '',
                                                type: (img.type || 'UNKNOWN').toUpperCase(),
                                                laterality: img.imageLaterality || img.laterality || '',
                                                parentsUUID: img.parentsUUID || '',
                                            })),
                                        };
                                    });
                                    resolve({
                                        totalCount: body.totalCount,
                                        count: exams.length,
                                        exams: exams,
                                    });
                                }
                            }
                        );
                    });
                }
            """, page_num)

            if 'error' in result:
                print(f"ERROR {result['error']}")
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

        except Exception as e:
            print(f"EXCEPTION: {e}")
            break

    print(f"Total exams: {len(all_exams)} (expected: {total_count})")
    return all_exams, total_count or 0


async def fetch_exam_images(page, exam_id):
    """Fetch image details for a specific exam via /examData/list API."""
    try:
        result = await page.evaluate('''async (examId) => {
            const resp = await fetch(
                `https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`,
                { credentials: "include" }
            );
            return await resp.json();
        }''', exam_id)
        return result
    except Exception as e:
        print(f"    ERROR fetching exam details: {e}")
        return {'examDataList': []}


def download_image(url, filepath, cookies, headers):
    """Download a single image. Returns (success, size)."""
    if filepath.exists():
        size = filepath.stat().st_size
        if size > 1000:
            return True, size

    try:
        resp = requests.get(url, cookies=cookies, headers=headers, timeout=60)
        if resp.status_code == 200 and len(resp.content) > 1000:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            with open(filepath, 'wb') as f:
                f.write(resp.content)
            return True, len(resp.content)
        return False, 0
    except Exception as e:
        print(f"    DL ERROR: {e}")
        return False, 0


async def main():
    parser = argparse.ArgumentParser(description='Download staging images from EyerCloud')
    parser.add_argument('--email', required=True, help='EyerCloud login email')
    parser.add_argument('--password', required=True, help='EyerCloud password')
    parser.add_argument('--resume', action='store_true', help='Resume from saved state')
    parser.add_argument('--metadata-only', action='store_true',
                        help='Only fetch metadata (exam list), no image downloads')
    parser.add_argument('--start-exam', type=int, default=0,
                        help='Start downloading from exam index N (0-based)')
    parser.add_argument('--max-exams', type=int, default=0,
                        help='Download at most N exams (0=all)')
    args = parser.parse_args()

    email_safe = sanitize_email(args.email)
    auth_file = Path(f"auth_state_{email_safe}.json")
    staging_state_file = Path(f"staging_state_{email_safe}.json")
    dl_state_file = Path(f"staging_download_state_{email_safe}.json")
    download_dir = Path("downloads_staging") / email_safe

    print("=" * 60)
    print(f"  EyerCloud Staging Image Downloader")
    print(f"  Login:    {args.email}")
    print(f"  Auth:     {auth_file}")
    print(f"  State:    {dl_state_file}")
    print(f"  Output:   {download_dir}")
    print("=" * 60)

    # Load download state
    dl_state = load_json(dl_state_file) or {
        'email': args.email,
        'downloaded_exams': [],
        'exam_details': {},
        'stats': {'total_images': 0, 'total_bytes': 0},
    }

    # Load staging state (metadata)
    staging_state = load_json(staging_state_file) or {
        'email': args.email,
        'fetched_at': None,
        'patients': {},
        'exams': {},
        'exam_images': {},
    }

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if auth_file.exists():
            context = await browser.new_context(storage_state=str(auth_file))
            print("Using saved auth session")
        else:
            context = await browser.new_context()

        page = await context.new_page()

        # Login
        logged_in = await login_eyercloud(page, args.email, args.password, auth_file)
        if not logged_in:
            print("FATAL: Could not login.")
            await browser.close()
            sys.exit(1)

        await context.storage_state(path=str(auth_file))
        print("Auth state saved.\n")

        # Navigate and wait for socket
        await page.goto(f"{BASE_URL}/exam", timeout=60000)
        await asyncio.sleep(3)

        if not await wait_for_sails_socket(page):
            print("FATAL: Sails WebSocket not connected.")
            await browser.close()
            sys.exit(1)

        # ===== Phase 1: Get all exam IDs =====
        # Check if we already have the exam list in staging state
        if args.resume and staging_state.get('exams') and len(staging_state['exams']) > 0:
            print(f"\nResuming with {len(staging_state['exams'])} exams from staging state")
            # Reconstruct exam list from staging state
            all_exams = []
            for eid, exam_data in staging_state['exams'].items():
                all_exams.append({
                    'id': eid,
                    'patient': {
                        'fullName': exam_data.get('patientName', ''),
                        'id': exam_data.get('patientId', ''),
                    },
                    'date': exam_data.get('examDate', ''),
                    'clinicName': exam_data.get('clinicName', ''),
                    'examImages': staging_state.get('exam_images', {}).get(eid, []),
                })
            total_count = len(all_exams)
        else:
            all_exams, total_count = await fetch_all_exam_ids_via_socket(page)

            # Save staging state (metadata) for future DB import
            for exam in all_exams:
                eid = exam.get('id', '')
                if not eid:
                    continue

                # Patient
                pat = exam.get('patient', {}) or {}
                full_name = pat.get('fullName', '') or ''
                if not full_name:
                    full_name = f"{pat.get('firstName', '')} {pat.get('lastName', '')}".strip()

                pid = pat.get('id', '')
                anamnesis = pat.get('anamnesis', {}) or {}

                if pid and pid not in staging_state['patients']:
                    staging_state['patients'][pid] = {
                        'id': pid,
                        'rawName': full_name,
                        'normalizedName': normalize_name(full_name),
                        'cpf': pat.get('cpf', ''),
                        'gender': pat.get('gender', ''),
                        'birthday': pat.get('birthday', ''),
                        'phone': pat.get('phone', ''),
                        'prontuario': pat.get('mrn', ''),
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

                # Exam
                staging_state['exams'][eid] = {
                    'id': eid,
                    'patientName': full_name,
                    'patientId': pid,
                    'examDate': exam.get('date', ''),
                    'clinicName': exam.get('clinicName', ''),
                    'clinicId': exam.get('clinicId', ''),
                    'technicianName': exam.get('technicianName', ''),
                    'status': exam.get('status', ''),
                }

                # Images (filter REDFREE from socket data)
                images = []
                for img in exam.get('examImages', []):
                    img_type = (img.get('type') or 'UNKNOWN').upper()
                    if img_type == 'REDFREE':
                        continue
                    images.append({
                        'uuid': img.get('uuid', ''),
                        'type': img_type,
                        'laterality': img.get('laterality', ''),
                        'url': '',
                        'parentsUUID': img.get('parentsUUID', ''),
                    })
                staging_state['exam_images'][eid] = images

            staging_state['fetched_at'] = datetime.now().isoformat()
            save_json(staging_state, staging_state_file)
            print(f"\nStaging state saved: {len(staging_state['patients'])} patients, {len(staging_state['exams'])} exams")

        if args.metadata_only:
            total_imgs = sum(len(imgs) for imgs in staging_state.get('exam_images', {}).values())
            print(f"\nMetadata-only mode. Total images (no REDFREE): {total_imgs}")
            print(f"State: {staging_state_file}")
            await browser.close()
            return

        # ===== Phase 2: Download images =====
        print(f"\n=== Phase 2: Downloading images ===")
        print(f"Total exams: {len(all_exams)}")
        print(f"Already downloaded: {len(dl_state['downloaded_exams'])}")

        # Get cookies for HTTP downloads
        cookies_list = await context.cookies()
        cookies = {c['name']: c['value'] for c in cookies_list}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://ec2.eyercloud.com/',
        }

        download_dir.mkdir(parents=True, exist_ok=True)

        # Filter to pending exams
        pending_exams = [e for e in all_exams if e['id'] not in dl_state['downloaded_exams']]
        print(f"Pending: {len(pending_exams)} exams")

        # Apply start/max filters
        if args.start_exam > 0:
            pending_exams = pending_exams[args.start_exam:]
            print(f"Starting from index {args.start_exam}, remaining: {len(pending_exams)}")
        if args.max_exams > 0:
            pending_exams = pending_exams[:args.max_exams]
            print(f"Limited to {args.max_exams} exams")

        total_dl = 0
        total_skipped = 0
        total_failed = 0
        session_bytes = 0

        for idx, exam in enumerate(pending_exams):
            exam_id = exam['id']
            patient = exam.get('patient', {}) or {}
            patient_name = patient.get('fullName', '') or 'Unknown'

            print(f"\n[{idx+1}/{len(pending_exams)}] {patient_name} ({exam_id})")

            # Fetch exam details via API to get dataPath and image UUIDs
            details = await fetch_exam_images(page, exam_id)

            image_list = details.get('examDataList', [])
            data_path = details.get('dataPath', 'https://d25chn8x2vrs37.cloudfront.net')

            # Filter: only COLOR and ANTERIOR
            useful_images = [img for img in image_list if img.get('type') in ('COLOR', 'ANTERIOR')]
            redfree_count = sum(1 for img in image_list if img.get('type') == 'REDFREE')
            total_count_img = len(image_list)

            print(f"  Images: {total_count_img} total, {len(useful_images)} useful, {redfree_count} REDFREE skipped")

            if not useful_images:
                print("  No useful images - marking done")
                dl_state['downloaded_exams'].append(exam_id)
                save_json(dl_state, dl_state_file)
                continue

            # Create folder
            folder = safe_folder_name(patient_name, exam_id)
            exam_dir = download_dir / folder

            # Download images
            exam_dl = 0
            exam_existed = 0
            for img in useful_images:
                uuid = img['uuid']
                filepath = exam_dir / f"{uuid}.jpg"

                if filepath.exists() and filepath.stat().st_size > 1000:
                    exam_existed += 1
                    exam_dl += 1
                    continue

                img_url = f"{data_path}/{uuid}"
                # Yield to asyncio event loop before each blocking download
                # to prevent Playwright context timeout
                await asyncio.sleep(0)
                ok, size = download_image(img_url, filepath, cookies, headers)
                if ok:
                    exam_dl += 1
                    total_dl += 1
                    session_bytes += size
                else:
                    total_failed += 1
                    print(f"    FAIL: {uuid[:12]}...")

            if exam_existed > 0:
                total_skipped += exam_existed

            print(f"  Result: {exam_dl}/{len(useful_images)} ({exam_existed} existed, {exam_dl - exam_existed} new)")

            # Save exam detail in download state
            dl_state['exam_details'][exam_id] = {
                'patient_name': patient_name,
                'folder_name': folder,
                'expected_images': len(useful_images),
                'downloaded_images': exam_dl,
                'download_date': datetime.now().isoformat(),
                'image_details': [
                    {'uuid': img['uuid'], 'type': img.get('type'), 'laterality': img.get('imageLaterality', '')}
                    for img in useful_images
                ],
            }

            if exam_dl >= len(useful_images):
                dl_state['downloaded_exams'].append(exam_id)

            # Save state every exam
            dl_state['stats']['total_images'] = sum(
                d.get('downloaded_images', 0) for d in dl_state['exam_details'].values()
            )
            dl_state['stats']['total_bytes'] = dl_state['stats'].get('total_bytes', 0) + session_bytes
            save_json(dl_state, dl_state_file)

            # Brief pause to not hammer the API
            await asyncio.sleep(0.5)

            # Keepalive: ping the page to prevent Playwright context timeout
            try:
                await page.evaluate("() => document.title")
            except Exception:
                pass

            # Refresh cookies every 50 exams (session might expire)
            if (idx + 1) % 50 == 0:
                try:
                    cookies_list = await context.cookies()
                    cookies = {c['name']: c['value'] for c in cookies_list}
                    print(f"  --- Refreshed cookies ({idx+1} exams done) ---")
                except:
                    pass

        await browser.close()

    # Final summary
    completed = len(dl_state['downloaded_exams'])
    total_exams = len(all_exams)
    total_imgs_dl = sum(d.get('downloaded_images', 0) for d in dl_state['exam_details'].values())

    print(f"\n{'=' * 60}")
    print(f"  DOWNLOAD COMPLETE")
    print(f"{'=' * 60}")
    print(f"  Exams completed:  {completed}/{total_exams}")
    print(f"  Images total:     {total_imgs_dl}")
    print(f"  This session:")
    print(f"    New downloads:  {total_dl}")
    print(f"    Already existed:{total_skipped}")
    print(f"    Failed:         {total_failed}")
    print(f"    Bytes:          {session_bytes / (1024*1024):.1f} MB")
    print(f"  Files:")
    print(f"    Images:         {download_dir}")
    print(f"    Download state: {dl_state_file}")
    print(f"    Staging state:  {staging_state_file}")
    print(f"{'=' * 60}")

    if completed < total_exams:
        print(f"\nTo resume: python download_staging_images.py --email \"{args.email}\" --password \"xxx\" --resume")
    print(f"\nNext: python bytescale_uploader.py (after adapting for staging downloads)")


if __name__ == '__main__':
    asyncio.run(main())
