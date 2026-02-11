"""
Download 7 missing COLOR images for Helena Maria Souza Dominguez.
Exam ID: 69809d871fa8062e17d3adba

These images exist on EyerCloud but were never downloaded.
After downloading, upload to Bytescale and import to DB.

Usage:
    cd scripts/eyercloud_downloader
    python download_helena_images.py
"""

import asyncio
import json
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    exit(1)

DOWNLOAD_DIR = Path("downloads")
AUTH_STATE_FILE = Path("auth_state.json")
BASE_URL = "https://ec2.eyercloud.com"

EXAM_ID = "69809d871fa8062e17d3adba"
PATIENT_NAME = "HELENA MARIA SOUZA DOMINGUEZ"

# 7 COLOR images missing from DB (never downloaded)
MISSING_UUIDS = [
    "e3fb9099-9a0a-4431-a3a0-bd374554a0a8",
    "e4cceab6-4c5e-43ac-a5bb-53591c32ea4f",
    "b08a6a4e-bac9-4fc4-a7dc-f87eee50762b",
    "ee2e6450-b25c-4584-a09a-9e77ed4c7e66",
    "f05666e7-bf2b-4bb3-818e-491409e5f7bf",
    "c62fd88c-d254-4892-ad3f-1b09fe20a4fc",
    "bd9a2108-5f3f-4147-aed8-a3eb0a69ea85",
]


async def main():
    print(f"=== Download Missing Images for {PATIENT_NAME} ===")
    print(f"Exam ID: {EXAM_ID}")
    print(f"Missing images: {len(MISSING_UUIDS)}")

    exam_folder = DOWNLOAD_DIR / f"HELENA_MARIA_SOUZA_DOMINGUEZ_{EXAM_ID[:8]}"
    exam_folder.mkdir(parents=True, exist_ok=True)

    # Check which are already downloaded
    already = [u for u in MISSING_UUIDS if (exam_folder / f"{u}.jpg").exists()]
    to_download = [u for u in MISSING_UUIDS if not (exam_folder / f"{u}.jpg").exists()]

    if already:
        print(f"Already downloaded: {len(already)}")
    if not to_download:
        print("All images already downloaded!")
        return

    print(f"To download: {len(to_download)}")

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
        if "login" in page.url.lower():
            print("\n=== SESSION EXPIRED - Please login ===")
            print("Login in the browser, then press ENTER here")
            await asyncio.get_event_loop().run_in_executor(None, input, ">>> Press ENTER after login: ")
            await context.storage_state(path=str(AUTH_STATE_FILE))
            print("Session saved!")

        # Get the data path from exam API
        try:
            details = await page.evaluate('''async (examId) => {
                const response = await fetch(
                    `https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`,
                    { credentials: "include" }
                );
                return await response.json();
            }''', EXAM_ID)
        except Exception as e:
            print(f"ERROR fetching exam details: {e}")
            await browser.close()
            return

        data_path = details.get('dataPath', 'https://d25chn8x2vrs37.cloudfront.net')
        print(f"Data path: {data_path}")

        # Download using requests
        import requests
        cookies_list = await context.cookies()
        cookies = {c['name']: c['value'] for c in cookies_list}
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://ec2.eyercloud.com/',
        }

        downloaded = 0
        for uuid in to_download:
            filepath = exam_folder / f"{uuid}.jpg"
            img_url = f"{data_path}/{uuid}"

            try:
                resp = requests.get(img_url, cookies=cookies, headers=headers, timeout=30)
                if resp.status_code == 200 and len(resp.content) > 1000:
                    with open(filepath, 'wb') as f:
                        f.write(resp.content)
                    downloaded += 1
                    print(f"  OK {uuid} ({len(resp.content)} bytes)")
                else:
                    print(f"  FAIL {uuid} status={resp.status_code} size={len(resp.content)}")
            except Exception as e:
                print(f"  ERROR {uuid}: {e}")

        await browser.close()

    print(f"\n=== DONE ===")
    print(f"Downloaded: {downloaded}/{len(to_download)}")
    print(f"Saved to: {exam_folder}")
    print(f"\nNext steps:")
    print(f"  1. Upload to Bytescale: python bytescale_uploader.py")
    print(f"  2. Update bytescale_mapping_v2.json with new URLs")
    print(f"  3. Import to DB: node ../fix_missing_mapped_images.js --execute")


if __name__ == "__main__":
    asyncio.run(main())
