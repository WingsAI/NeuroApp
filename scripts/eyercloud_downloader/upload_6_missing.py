"""
Upload 6 missing images to Bytescale for 3 patients.
Uses the same Bytescale API as bytescale_uploader.py.

Usage:
    python upload_6_missing.py              # Upload all 6 images
    python upload_6_missing.py --dry-run    # Preview without uploading
"""

import os
import json
import requests
from pathlib import Path

# --- BYTESCALE CONFIG ---
API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"
UPLOAD_BASE_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"
CDN_BASE_URL = f"https://upcdn.io/{ACCOUNT_ID}/raw"

# --- 6 MISSING IMAGES ---
MISSING = [
    # MARINEI LULIO RODRIGUES
    {"uuid": "237e9fa8-045a-47e9-a570-d68a5a5c57a7", "type": "COLOR", "lat": "L",
     "patient": "MARINEI_LULIO_RODRIGUES", "exam_id": "697d03dd565494aed21c07c4"},
    # RITA SIMONE PASTEGA LISBOA
    {"uuid": "ceae2550-01b9-4484-ab71-427f2721659c", "type": "COLOR", "lat": "R",
     "patient": "RITA_SIMONE_PASTEGA_LISBOA", "exam_id": "697d03df7927d48de9d88c52"},
    {"uuid": "a4df9080-faa8-4892-add7-9ecb38ff763f", "type": "COLOR", "lat": "L",
     "patient": "RITA_SIMONE_PASTEGA_LISBOA", "exam_id": "697d03df7927d48de9d88c52"},
    # YASMIN GABRIELLA DOS SANTOS FREITAS
    {"uuid": "4f20575b-e5e1-41b6-841b-ec70c26c1d3c", "type": "COLOR", "lat": "L",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam_id": "697d03e48bc8fc9984f742b0"},
    {"uuid": "176c4245-5afc-451c-9648-cf1217012837", "type": "ANTERIOR", "lat": "R",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam_id": "697d03e48bc8fc9984f742b0"},
    {"uuid": "b5c09b71-50ad-4a8f-a521-347daf065dc3", "type": "COLOR", "lat": "L",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam_id": "697d03e48bc8fc9984f742b0"},
]

IMAGES_DIR = Path(__file__).parent / "downloads_6_missing"
OUTPUT_FILE = Path(__file__).parent / "upload_6_results.json"


def upload_file(filepath, folder_path, filename):
    """Upload a file to Bytescale."""
    params = {
        'folderPath': folder_path,
        'fileName': filename
    }
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': 'image/jpeg'
    }
    with open(filepath, 'rb') as f:
        file_data = f.read()
    headers['Content-Length'] = str(len(file_data))

    response = requests.post(UPLOAD_BASE_URL, params=params, headers=headers, data=file_data)
    if response.status_code in [200, 201]:
        return response.json()
    else:
        print(f"  ERROR {response.status_code}: {response.text[:200]}")
        return None


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    print("=" * 60)
    print("Upload 6 Missing Images to Bytescale")
    print("=" * 60)

    if args.dry_run:
        print("DRY-RUN MODE - no uploads\n")

    results = []
    for img in MISSING:
        filepath = IMAGES_DIR / f"{img['uuid']}.jpg"
        if not filepath.exists():
            print(f"  FILE NOT FOUND: {filepath}")
            continue

        size = filepath.stat().st_size
        folder_path = f"/eyercloud/{img['exam_id']}"
        filename = f"{img['uuid']}.jpg"

        print(f"\n{img['patient']} - {img['uuid']}")
        print(f"  Type: {img['type']} Lat: {img['lat']} Size: {size} bytes")
        print(f"  -> {folder_path}/{filename}")

        if args.dry_run:
            print("  [SKIPPED - dry run]")
            continue

        result = upload_file(filepath, folder_path, filename)
        if result:
            file_url = result.get('fileUrl', '')
            print(f"  UPLOADED: {file_url}")
            results.append({
                **img,
                "bytescale_url": file_url,
                "file_size": size
            })
        else:
            print(f"  FAILED!")

    if results:
        with open(OUTPUT_FILE, 'w') as f:
            json.dump(results, f, indent=2)
        print(f"\n{len(results)} images uploaded. Results: {OUTPUT_FILE}")
    else:
        print("\nNo images uploaded.")


if __name__ == "__main__":
    main()
