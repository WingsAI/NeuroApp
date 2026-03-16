"""
Bytescale Uploader for 312 new Jaci exams
==========================================
Uploads images from downloads_new_312/ to Bytescale.
Creates bytescale_mapping_new_312.json with URLs.

Usage:
    cd scripts/eyercloud_downloader
    python upload_new_312.py              # Upload all
    python upload_new_312.py --dry-run    # Simulate only
    python upload_new_312.py --resume     # Skip already uploaded
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime
import mimetypes
import re

# --- BYTESCALE CONFIG ---
API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"
UPLOAD_BASE_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"

# --- LOCAL CONFIG ---
DOWNLOAD_DIR = Path("downloads_new_312")
STATE_FILE = Path("bytescale_upload_new_312_progress.json")
MAPPING_FILE = Path("bytescale_mapping_new_312.json")
EXAMS_FILE = Path("new_exams_312.json")


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"uploaded_files": [], "patient_mapping": {}}


def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)


def save_mapping(state):
    mapping = state.get('patient_mapping', {})
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=4, ensure_ascii=False)
    print(f"📄 Mapping saved: {MAPPING_FILE.absolute()}")


def sanitize_folder_name(name):
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', name)
    safe_name = safe_name.replace(' ', '_')
    return safe_name


def get_mime_type(filepath):
    mime_type, _ = mimetypes.guess_type(str(filepath))
    return mime_type or 'application/octet-stream'


def upload_file(filepath, folder_path, filename):
    url = UPLOAD_BASE_URL
    params = {'folderPath': folder_path, 'fileName': filename}
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': get_mime_type(filepath)
    }

    with open(filepath, 'rb') as f:
        file_data = f.read()

    headers['Content-Length'] = str(len(file_data))
    response = requests.post(url, params=params, headers=headers, data=file_data)

    if response.status_code in [200, 201]:
        return response.json()
    else:
        print(f"      ❌ Error {response.status_code}: {response.text[:200]}")
        return None


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Bytescale Uploader - New 312 Exams')
    parser.add_argument('--dry-run', action='store_true', help='Simulate without uploading')
    parser.add_argument('--resume', action='store_true', help='Skip already uploaded files')
    args = parser.parse_args()

    print("=" * 60)
    print("☁️ Bytescale Uploader - 312 New Jaci Exams")
    print("=" * 60)

    if args.dry_run:
        print("⚠️ DRY-RUN MODE - No uploads will be made\n")

    state = load_state()

    if not DOWNLOAD_DIR.exists():
        print(f"❌ Download dir not found: {DOWNLOAD_DIR}")
        return

    # Load exam metadata for image type info
    exam_metadata = {}
    if EXAMS_FILE.exists():
        with open(EXAMS_FILE, 'r', encoding='utf-8') as f:
            exam_metadata = json.load(f)
        print(f"📊 Loaded metadata for {len(exam_metadata)} exams")

    total_images = 0
    total_uploaded = 0
    total_skipped = 0
    total_errors = 0

    patient_folders = sorted([f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()])
    print(f"📁 Found {len(patient_folders)} patient folders\n")

    patient_count = 0
    for patient_folder in patient_folders:
        patient_count += 1
        folder_name = patient_folder.name

        # Extract name and exam ID from folder name (FORMAT: NAME_ID)
        parts = folder_name.rsplit('_', 1)
        if len(parts) == 2 and len(parts[1]) >= 8 and all(c in '0123456789abcdefABCDEF' for c in parts[1]):
            clean_name = parts[0].replace('_', ' ')
            exam_id_short = parts[1]
        else:
            clean_name = folder_name.replace('_', ' ')
            exam_id_short = 'unknown'

        # Find full exam_id from metadata
        full_exam_id = None
        exam_details = None
        for eid, details in exam_metadata.items():
            if eid.startswith(exam_id_short):
                full_exam_id = eid
                exam_details = details
                break

        if not full_exam_id:
            full_exam_id = exam_id_short

        # List images
        images = sorted([f for f in patient_folder.iterdir()
                        if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png']])

        if not images:
            continue

        # Build image type lookup from metadata
        image_type_map = {}
        if exam_details and 'image_details' in exam_details:
            for img_data in exam_details['image_details']:
                image_type_map[img_data['uuid']] = {
                    'type': img_data.get('type', 'UNKNOWN'),
                    'laterality': img_data.get('laterality', '')
                }

        print(f"[{patient_count}/{len(patient_folders)}] 👤 {clean_name} ({len(images)} images)")

        # Init mapping entry
        if folder_name not in state['patient_mapping']:
            state['patient_mapping'][folder_name] = {
                'images': [],
                'bytescale_folder': f'/neuroapp/patients/{sanitize_folder_name(folder_name)}'
            }

        # Update metadata
        patient_meta = {
            'patient_name': clean_name,
            'exam_id': full_exam_id,
        }
        if exam_details:
            patient_meta.update({
                'patient_id': exam_details.get('patient_id', ''),
                'clinic_name': exam_details.get('clinic', ''),
                'birthday': exam_details.get('birthday', ''),
                'gender': exam_details.get('gender', ''),
                'cpf': exam_details.get('cpf', ''),
                'exam_date': exam_details.get('exam_date', ''),
                'anamnesis': exam_details.get('anamnesis', {}),
                'otherDisease': exam_details.get('otherDisease', ''),
                'telephone': exam_details.get('telephone', ''),
            })

        state['patient_mapping'][folder_name].update(patient_meta)
        patient_data = state['patient_mapping'][folder_name]
        bytescale_folder = patient_data['bytescale_folder']

        # Get already uploaded image filenames for this patient
        already_uploaded_filenames = {img['filename'] for img in patient_data.get('images', [])}

        for image in images:
            total_images += 1
            image_path = str(image.absolute())
            image_uuid = image.stem

            # Check image type from metadata - skip REDFREE
            img_info = image_type_map.get(image_uuid, {})
            img_type = img_info.get('type', 'UNKNOWN')

            if img_type == 'REDFREE':
                total_skipped += 1
                continue

            # Check if already uploaded (by filepath or filename)
            if args.resume and (image_path in state['uploaded_files'] or image.name in already_uploaded_filenames):
                total_skipped += 1
                continue

            if args.dry_run:
                print(f"   📤 [DRY-RUN] {image.name} ({img_type})")
                total_uploaded += 1
                continue

            # Upload
            result = upload_file(image, bytescale_folder, image.name)

            if result:
                print(f"   ✅ {image.name} ({img_type})")
                state['uploaded_files'].append(image_path)

                patient_data['images'].append({
                    'filename': image.name,
                    'type': img_type,
                    'laterality': img_info.get('laterality', ''),
                    'local_path': image_path,
                    'bytescale_path': result.get('filePath'),
                    'bytescale_url': result.get('fileUrl'),
                    'upload_date': datetime.now().isoformat()
                })

                total_uploaded += 1
            else:
                total_errors += 1

        # Save state after each patient
        if not args.dry_run:
            save_state(state)
            if patient_count % 20 == 0:
                save_mapping(state)
                print(f"   💾 Checkpoint saved ({patient_count}/{len(patient_folders)})")
        print()

    # Final mapping save
    if not args.dry_run:
        save_mapping(state)

    # Summary
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    print(f"   Total images: {total_images}")
    print(f"   ✅ Uploaded: {total_uploaded}")
    print(f"   ⏭️ Skipped: {total_skipped}")
    print(f"   ❌ Errors: {total_errors}")
    print("=" * 60)


if __name__ == "__main__":
    main()
