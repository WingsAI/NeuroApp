"""
Download 6 specific missing images from EyerCloud for 3 patients.
Run from browser console first to get image download URLs, or use Playwright.

Missing images:
- MARINEI LULIO RODRIGUES: 237e9fa8-045a-47e9-a570-d68a5a5c57a7 COLOR L
- RITA SIMONE PASTEGA LISBOA: ceae2550-01b9-4484-ab71-427f2721659c COLOR R
- RITA SIMONE PASTEGA LISBOA: a4df9080-faa8-4892-add7-9ecb38ff763f COLOR L
- YASMIN GABRIELLA DOS SANTOS FREITAS: 4f20575b-e5e1-41b6-841b-ec70c26c1d3c COLOR L
- YASMIN GABRIELLA DOS SANTOS FREITAS: 176c4245-5afc-451c-9648-cf1217012837 ANTERIOR R
- YASMIN GABRIELLA DOS SANTOS FREITAS: b5c09b71-50ad-4a8f-a521-347daf065dc3 COLOR L
"""

import os
import json
import time
from playwright.sync_api import sync_playwright

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads_6_missing")
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

MISSING = {
    "697d03dd565494aed21c07c4": {
        "patient": "MARINEI_LULIO_RODRIGUES",
        "images": [
            {"uuid": "237e9fa8-045a-47e9-a570-d68a5a5c57a7", "type": "COLOR", "laterality": "L"},
        ]
    },
    "697d03df7927d48de9d88c52": {
        "patient": "RITA_SIMONE_PASTEGA_LISBOA",
        "images": [
            {"uuid": "ceae2550-01b9-4484-ab71-427f2721659c", "type": "COLOR", "laterality": "R"},
            {"uuid": "a4df9080-faa8-4892-add7-9ecb38ff763f", "type": "COLOR", "laterality": "L"},
        ]
    },
    "697d03e48bc8fc9984f742b0": {
        "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS",
        "images": [
            {"uuid": "4f20575b-e5e1-41b6-841b-ec70c26c1d3c", "type": "COLOR", "laterality": "L"},
            {"uuid": "176c4245-5afc-451c-9648-cf1217012837", "type": "ANTERIOR", "laterality": "R"},
            {"uuid": "b5c09b71-50ad-4a8f-a521-347daf065dc3", "type": "COLOR", "laterality": "L"},
        ]
    }
}

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Navigate to EyerCloud and wait for manual login
        page.goto("https://eyercloud.com")
        print("Please log in to EyerCloud. Press Enter when ready...")
        input()

        downloaded = 0
        for exam_id, info in MISSING.items():
            patient_name = info["patient"]
            patient_dir = os.path.join(DOWNLOAD_DIR, f"{patient_name}_{exam_id[:8]}")
            os.makedirs(patient_dir, exist_ok=True)

            # Fetch exam data
            print(f"\nFetching exam {exam_id} for {patient_name}...")
            result = page.evaluate(f"""
                (async () => {{
                    const resp = await fetch('https://eyercloud.com/api/v2/eyercloud/examData/list?id={exam_id}', {{
                        method: 'POST',
                        credentials: 'include',
                        headers: {{ 'Content-Type': 'application/json' }}
                    }});
                    return await resp.json();
                }})()
            """)

            exam_data_list = result.get("examDataList", [])

            for img_info in info["images"]:
                uuid = img_info["uuid"]
                img_type = img_info["type"]
                laterality = img_info["laterality"]

                # Find the image in examDataList to get the download URL
                exam_data = next((d for d in exam_data_list if d["uuid"] == uuid), None)
                if not exam_data:
                    print(f"  WARNING: Image {uuid} not found in exam data!")
                    continue

                # Download image via EyerCloud CDN
                img_url = f"https://eyercloud.com/api/v2/eyercloud/examData/image/{uuid}"

                filepath = os.path.join(patient_dir, f"{uuid}.jpg")
                if os.path.exists(filepath):
                    print(f"  Already downloaded: {uuid}.jpg")
                    downloaded += 1
                    continue

                print(f"  Downloading {uuid}.jpg ({img_type} {laterality})...")

                # Use page to download
                img_bytes = page.evaluate(f"""
                    (async () => {{
                        const resp = await fetch('https://eyercloud.com/api/v2/eyercloud/examData/image/{uuid}', {{
                            credentials: 'include'
                        }});
                        const buf = await resp.arrayBuffer();
                        return Array.from(new Uint8Array(buf));
                    }})()
                """)

                if img_bytes and len(img_bytes) > 1000:
                    with open(filepath, 'wb') as f:
                        f.write(bytes(img_bytes))
                    print(f"  Saved: {filepath} ({len(img_bytes)} bytes)")
                    downloaded += 1
                else:
                    print(f"  ERROR: Got {len(img_bytes) if img_bytes else 0} bytes for {uuid}")

                time.sleep(0.5)

        print(f"\nDownloaded {downloaded}/6 images to {DOWNLOAD_DIR}")
        browser.close()

if __name__ == "__main__":
    main()
