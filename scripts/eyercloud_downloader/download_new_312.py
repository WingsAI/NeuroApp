"""
Download images for the 312 new exams found on EyerCloud.
Uses existing Playwright auth session for cookies.
Reads exam/image data from new_exams_312.json (already fetched).

Usage:
    cd scripts/eyercloud_downloader
    python download_new_312.py
    python download_new_312.py --resume   # skip already downloaded
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

DOWNLOAD_DIR = Path("downloads_new_312")
STATE_FILE = Path("download_state.json")
AUTH_STATE_FILE = Path("auth_state.json")
NEW_EXAMS_FILE = Path("new_exams_312.json")
CDN_BASE = "https://d25chn8x2vrs37.cloudfront.net"
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
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--resume', action='store_true', help='Skip already downloaded exams')
    args = parser.parse_args()

    # Load new exams data
    with open(NEW_EXAMS_FILE, 'r', encoding='utf-8') as f:
        new_exams = json.load(f)

    exam_ids = list(new_exams.keys())
    print(f"=== Download New 312 Exams ===")
    print(f"Total exams in file: {len(exam_ids)}")

    state = load_state()

    if args.resume:
        already_done = [eid for eid in exam_ids if eid in state.get('downloaded_exams', [])]
        to_download = [eid for eid in exam_ids if eid not in state.get('downloaded_exams', [])]
        print(f"Already downloaded: {len(already_done)}")
    else:
        to_download = exam_ids

    print(f"To download: {len(to_download)}")

    if not to_download:
        print("All exams already downloaded!")
        return

    total_images = sum(new_exams[eid]['useful_images_count'] for eid in to_download)
    print(f"Total images to download: {total_images}")

    DOWNLOAD_DIR.mkdir(exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
        else:
            context = await browser.new_context()

        page = await context.new_page()

        print("Navigating to EyerCloud...")
        await page.goto(f"{BASE_URL}/exam", wait_until="load", timeout=60000)
        await asyncio.sleep(3)

        # Check if logged in
        if "login" in page.url.lower():
            print("\n=== SESSION EXPIRED - Please login ===")
            print("Login in the browser, then press ENTER here")
            await asyncio.get_event_loop().run_in_executor(None, input, ">>> Press ENTER after login: ")
            await context.storage_state(path=str(AUTH_STATE_FILE))
            print("Session saved!")

        # Get cookies for requests
        import requests as req_lib
        cookies_list = await context.cookies()
        cookies = {c['name']: c['value'] for c in cookies_list}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://ec2.eyercloud.com/',
        }

        total_downloaded = 0
        total_skipped = 0
        total_failed = 0

        for idx, exam_id in enumerate(to_download):
            exam_data = new_exams[exam_id]
            patient_name = exam_data['patient_name']
            image_details = exam_data['image_details']  # already filtered (no REDFREE)

            print(f"\n[{idx+1}/{len(to_download)}] {patient_name} ({exam_id[:8]}...)")
            print(f"  Images: {len(image_details)} useful")

            # Create folder
            safe_name = re.sub(r'[<>:"/\\|?*]', '_', patient_name).replace(' ', '_')
            folder_name = f"{safe_name}_{exam_id[:8]}"
            exam_folder = DOWNLOAD_DIR / folder_name
            exam_folder.mkdir(parents=True, exist_ok=True)

            exam_downloaded = 0
            for img in image_details:
                uuid = img['uuid']
                img_type = img.get('type', 'UNKNOWN')
                filepath = exam_folder / f"{uuid}.jpg"

                if filepath.exists() and filepath.stat().st_size > 1000:
                    exam_downloaded += 1
                    total_skipped += 1
                    continue

                img_url = f"{CDN_BASE}/{uuid}"
                try:
                    resp = req_lib.get(img_url, cookies=cookies, headers=headers, timeout=30)
                    if resp.status_code == 200 and len(resp.content) > 1000:
                        with open(filepath, 'wb') as f:
                            f.write(resp.content)
                        exam_downloaded += 1
                        total_downloaded += 1
                        if total_downloaded % 50 == 0:
                            print(f"  ... {total_downloaded} images downloaded so far")
                    else:
                        print(f"  FAIL {img_type} {uuid[:8]}... status={resp.status_code} size={len(resp.content)}")
                        total_failed += 1
                except Exception as e:
                    print(f"  ERROR {uuid[:8]}...: {e}")
                    total_failed += 1

            print(f"  Downloaded: {exam_downloaded}/{len(image_details)}")

            # Update state with exam details
            anamnesis = exam_data.get('anamnesis', {})
            underlying_diseases = {
                "diabetes": anamnesis.get('diabetes', exam_data.get('diabetes', False)),
                "hypertension": anamnesis.get('hypertension', exam_data.get('hypertension', False)),
                "cholesterol": anamnesis.get('cholesterol', exam_data.get('cholesterol', False)),
                "smoker": anamnesis.get('smoker', exam_data.get('smoker', False))
            }

            state['exam_details'][exam_id] = {
                'patient_name': patient_name,
                'patient_id': exam_data.get('patient_id', ''),
                'expected_images': len(image_details),
                'folder_name': folder_name,
                'exam_date': exam_data.get('exam_date', ''),
                'download_date': datetime.now().isoformat(),
                'cpf': exam_data.get('cpf', ''),
                'birthday': exam_data.get('birthday', ''),
                'gender': exam_data.get('gender', ''),
                'clinic_name': exam_data.get('clinic', ''),
                'underlying_diseases': underlying_diseases,
                'ophthalmic_diseases': {},
                'otherDisease': exam_data.get('otherDisease', ''),
                'image_details': image_details
            }

            if exam_id not in state['downloaded_exams']:
                state['downloaded_exams'].append(exam_id)

            # Save state every 10 exams
            if (idx + 1) % 10 == 0:
                save_state(state)
                print(f"  [State saved - {idx+1}/{len(to_download)} exams processed]")

        # Final save
        save_state(state)

        # Save updated auth state
        await context.storage_state(path=str(AUTH_STATE_FILE))

        await browser.close()

    print(f"\n=== DONE ===")
    print(f"Downloaded: {total_downloaded} images")
    print(f"Skipped (already existed): {total_skipped}")
    print(f"Failed: {total_failed}")
    print(f"Total exams in state: {len(state['downloaded_exams'])}")
    print(f"Download folder: {DOWNLOAD_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
