"""
Download images for the 48 missing exams (47 patients).
Uses existing Playwright auth session.

Usage:
    cd scripts/eyercloud_downloader
    python download_missing_48.py
"""

import asyncio
import json
import os
import re
from pathlib import Path
from datetime import datetime

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    exit(1)

DOWNLOAD_DIR = Path("downloads")
STATE_FILE = Path("download_state.json")
AUTH_STATE_FILE = Path("auth_state.json")
MISSING_FILE = Path("../missing_47_patients.json")
BASE_URL = "https://ec2.eyercloud.com"


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"downloaded_exams": [], "exam_details": {}}


def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)


async def main():
    # Load missing exams
    with open(MISSING_FILE, 'r', encoding='utf-8') as f:
        missing = json.load(f)

    exam_ids = missing['examIds']
    # Build name lookup
    name_by_exam = {}
    for p in missing['patients']:
        name_by_exam[p['examId']] = p['name']

    print(f"=== Download Missing 48 Exams ===")
    print(f"Exam IDs to download: {len(exam_ids)}")

    state = load_state()

    # Check which are already fully downloaded
    already_done = [eid for eid in exam_ids if eid in state.get('downloaded_exams', [])]
    to_download = [eid for eid in exam_ids if eid not in state.get('downloaded_exams', [])]
    print(f"Already downloaded: {already_done}")
    print(f"To download: {len(to_download)}")

    if not to_download:
        print("All exams already downloaded!")
        return

    DOWNLOAD_DIR.mkdir(exist_ok=True)

    async with async_playwright() as p:
        if not AUTH_STATE_FILE.exists():
            print("ERROR: auth_state.json not found. Run downloader_playwright.py first to login.")
            return

        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
        page = await context.new_page()

        print("Navigating to EyerCloud...")
        await page.goto(f"{BASE_URL}/exam", wait_until="load", timeout=60000)
        await asyncio.sleep(3)

        # Check if logged in
        content = await page.content()
        if "login" in page.url.lower():
            print("\n=== SESSION EXPIRED - Please login ===")
            print("Login in the browser, then press ENTER here")
            await asyncio.get_event_loop().run_in_executor(None, input, ">>> Press ENTER after login: ")
            await context.storage_state(path=str(AUTH_STATE_FILE))
            print("Session saved!")

        total_downloaded = 0

        for idx, exam_id in enumerate(to_download):
            patient_name = name_by_exam.get(exam_id, 'Unknown')
            print(f"\n[{idx+1}/{len(to_download)}] {patient_name} ({exam_id})")

            # Fetch exam details via API
            try:
                details = await page.evaluate('''async (examId) => {
                    const response = await fetch(
                        `https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`,
                        { credentials: "include" }
                    );
                    return await response.json();
                }''', exam_id)
            except Exception as e:
                print(f"  ERROR fetching details: {e}")
                continue

            image_list = details.get('examDataList', [])
            data_path = details.get('dataPath', 'https://d25chn8x2vrs37.cloudfront.net')

            # Filter: only COLOR and ANTERIOR
            useful_images = [img for img in image_list if img.get('type') in ('COLOR', 'ANTERIOR')]
            all_count = len(image_list)
            useful_count = len(useful_images)

            print(f"  Images: {all_count} total, {useful_count} useful (COLOR+ANTERIOR)")

            # Extract patient details from exam (with type guards)
            exam_obj = details.get('exam', {}) or {}
            if not isinstance(exam_obj, dict):
                exam_obj = {}
            patient_obj = exam_obj.get('patient', {}) or {}
            if not isinstance(patient_obj, dict):
                patient_obj = {}
            anamnesis = patient_obj.get('anamnesis', {}) or {}
            if not isinstance(anamnesis, dict):
                anamnesis = {}
            clinic = exam_obj.get('clinic', {})
            if isinstance(clinic, dict):
                clinic_name = clinic.get('name', '')
            elif isinstance(clinic, str):
                clinic_name = clinic
            else:
                clinic_name = ''

            # Create folder
            safe_name = re.sub(r'[<>:"/\\|?*]', '_', patient_name).replace(' ', '_')
            folder_name = f"{safe_name}_{exam_id[:8]}"
            exam_folder = DOWNLOAD_DIR / folder_name
            exam_folder.mkdir(parents=True, exist_ok=True)

            # Download useful images
            import requests
            cookies_list = await context.cookies()
            cookies = {c['name']: c['value'] for c in cookies_list}
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://ec2.eyercloud.com/',
            }

            exam_downloaded = 0
            for img in useful_images:
                uuid = img['uuid']
                img_type = img.get('type', 'UNKNOWN')
                filepath = exam_folder / f"{uuid}.jpg"

                if filepath.exists():
                    exam_downloaded += 1
                    continue

                img_url = f"{data_path}/{uuid}"
                try:
                    resp = requests.get(img_url, cookies=cookies, headers=headers, timeout=30)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        with open(filepath, 'wb') as f:
                            f.write(resp.content)
                        exam_downloaded += 1
                        total_downloaded += 1
                        print(f"  OK {img_type} {uuid[:8]}... ({len(resp.content)} bytes)")
                    else:
                        print(f"  FAIL {uuid[:8]}... status={resp.status_code} size={len(resp.content)}")
                except Exception as e:
                    print(f"  ERROR {uuid[:8]}...: {e}")

            print(f"  Downloaded: {exam_downloaded}/{useful_count}")

            # Update state
            underlying_diseases = {
                "diabetes": anamnesis.get('diabetes', patient_obj.get('diabetes', False)),
                "hypertension": anamnesis.get('hypertension', patient_obj.get('hypertension', False)),
                "cholesterol": anamnesis.get('cholesterol', patient_obj.get('cholesterol', False)),
                "smoker": anamnesis.get('smoker', patient_obj.get('smoker', False))
            }
            ophthalmic_diseases = {
                "diabeticRetinopathy": anamnesis.get('diabeticRetinopathy', False),
                "dmri": anamnesis.get('dmri', False),
                "glaucoma": anamnesis.get('glaucoma', False),
                "cataract": anamnesis.get('cataract', False),
                "pterygium": anamnesis.get('pterygium', False),
                "lowVisualAcuity": anamnesis.get('lowVisualAcuity', False)
            }

            state['exam_details'][exam_id] = {
                'patient_name': patient_name,
                'expected_images': useful_count,
                'folder_name': folder_name,
                'exam_date': exam_obj.get('date'),
                'cpf': patient_obj.get('cpf', ''),
                'birthday': patient_obj.get('birthday', ''),
                'gender': patient_obj.get('gender', ''),
                'clinic_name': clinic_name,
                'underlying_diseases': underlying_diseases,
                'ophthalmic_diseases': ophthalmic_diseases,
                'otherDisease': patient_obj.get('otherDisease') or anamnesis.get('otherDisease'),
                'download_date': datetime.now().isoformat(),
                'image_details': [
                    {'uuid': img['uuid'], 'type': img.get('type'), 'laterality': img.get('imageLaterality')}
                    for img in useful_images
                ]
            }

            if exam_downloaded == useful_count:
                state['downloaded_exams'].append(exam_id)

            save_state(state)
            await asyncio.sleep(0.3)

        await browser.close()

    print(f"\n=== DONE ===")
    print(f"Total images downloaded this session: {total_downloaded}")
    print(f"Exams completed: {len([eid for eid in to_download if eid in state['downloaded_exams']])}/{len(to_download)}")


if __name__ == "__main__":
    asyncio.run(main())
