"""
Upload staging images to Bytescale cloud storage.
=================================================
Adapted from bytescale_uploader.py for staging downloads.

Reads images from:
    downloads_staging/{email_safe}/PATIENT_EXAMID8/UUID.jpg

Reads metadata from:
    staging_download_state_{email_safe}.json

Writes upload progress to:
    bytescale_upload_staging_{email_safe}_progress.json

Writes mapping to:
    bytescale_mapping_staging_{email_safe}.json

Usage:
    cd scripts/eyercloud_downloader
    python upload_staging_images.py --email "dramelinalannes.endocrino@gmail.com" --dry-run
    python upload_staging_images.py --email "dramelinalannes.endocrino@gmail.com"
    python upload_staging_images.py --email "mozaniareis@usp.br"
"""

import os
import sys
import json
import re
import requests
from pathlib import Path
from datetime import datetime
import mimetypes
import argparse

# --- BYTESCALE CONFIG ---
API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"
UPLOAD_BASE_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"
CDN_BASE_URL = f"https://upcdn.io/{ACCOUNT_ID}/raw"


def sanitize_email(email):
    return re.sub(r'[^a-zA-Z0-9]', '_', email.split('@')[0])


def sanitize_folder_name(name):
    """Remove special characters for use in Bytescale paths."""
    safe = re.sub(r'[<>:"/\\|?*]', '_', name)
    safe = safe.replace(' ', '_')
    return safe


def get_mime_type(filepath):
    mime_type, _ = mimetypes.guess_type(str(filepath))
    return mime_type or 'application/octet-stream'


def upload_file(filepath, folder_path, filename):
    """Upload a single file to Bytescale. Returns response JSON or None."""
    params = {
        'folderPath': folder_path,
        'fileName': filename,
    }
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': get_mime_type(filepath),
    }
    with open(filepath, 'rb') as f:
        file_data = f.read()
    headers['Content-Length'] = str(len(file_data))

    try:
        response = requests.post(UPLOAD_BASE_URL, params=params, headers=headers, data=file_data, timeout=60)
        if response.status_code in [200, 201]:
            return response.json()
        else:
            print(f"      FAIL HTTP {response.status_code}: {response.text[:200]}")
            return None
    except Exception as e:
        print(f"      FAIL upload error: {e}")
        return None


def load_json(path):
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


def save_json(data, path):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser(description='Upload staging images to Bytescale')
    parser.add_argument('--email', required=True, help='EyerCloud login email (used to find files)')
    parser.add_argument('--dry-run', action='store_true', help='Simulate without uploading')
    args = parser.parse_args()

    email_safe = sanitize_email(args.email)

    # Resolve script directory -- state files may be in project root or script dir
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent.parent  # scripts/eyercloud_downloader -> scripts -> project root

    def find_file(filename):
        """Search for a file in script dir, then project root."""
        for base in [script_dir, project_root]:
            candidate = base / filename
            if candidate.exists():
                return candidate
        # Default: project root (will fail later with clear error)
        return project_root / filename

    # Downloads folder: look in project root first (that's where download_staging_images.py saves)
    download_dir = None
    for base in [project_root, script_dir]:
        candidate = base / "downloads_staging" / email_safe
        if candidate.exists():
            download_dir = candidate
            break
    if download_dir is None:
        download_dir = project_root / "downloads_staging" / email_safe

    dl_state_path = find_file(f"staging_download_state_{email_safe}.json")
    progress_path = project_root / f"bytescale_upload_staging_{email_safe}_progress.json"
    mapping_path = project_root / f"bytescale_mapping_staging_{email_safe}.json"

    print("=" * 65)
    print(f"  Bytescale Staging Uploader")
    print(f"  Email:    {args.email}")
    print(f"  Source:   {download_dir}")
    print(f"  State:    {dl_state_path}")
    print(f"  Progress: {progress_path}")
    print(f"  Mapping:  {mapping_path}")
    print("=" * 65)

    if args.dry_run:
        print("*** DRY-RUN MODE -- no uploads will be made ***\n")

    # Load download state (metadata per exam)
    dl_state = load_json(dl_state_path)
    if not dl_state:
        print(f"ERROR: Download state not found: {dl_state_path}")
        print("   Run download_staging_images.py first.")
        return
    exam_details = dl_state.get('exam_details', {})
    print(f"Loaded {len(exam_details)} exams from download state")

    # Load upload progress (resume support)
    progress = load_json(progress_path) or {
        'uploaded_files': [],
        'patient_mapping': {},
    }
    uploaded_set = set(progress['uploaded_files'])
    print(f"Already uploaded: {len(uploaded_set)} files")

    # Verify downloads folder exists
    if not download_dir.exists():
        print(f"ERROR: Downloads folder not found: {download_dir}")
        return

    # Get all patient folders
    patient_folders = sorted([f for f in download_dir.iterdir() if f.is_dir()])
    print(f"Found {len(patient_folders)} patient folders\n")

    # Build UUID -> type lookup from download state
    uuid_type_map = {}
    for exam_id, details in exam_details.items():
        for img in details.get('image_details', []):
            uuid_type_map[img['uuid']] = img.get('type', 'UNKNOWN')

    # Counters
    total_images = 0
    total_uploaded = 0
    total_skipped = 0
    total_errors = 0
    patient_count = 0

    for patient_folder in patient_folders:
        patient_count += 1
        folder_name = patient_folder.name

        # Parse folder name: PATIENT_EXAMID8
        parts = folder_name.rsplit('_', 1)
        if len(parts) == 2 and len(parts[1]) >= 8 and all(c in '0123456789abcdefABCDEF' for c in parts[1]):
            clean_name = parts[0].replace('_', ' ')
            exam_short = parts[1]
        else:
            clean_name = folder_name.replace('_', ' ')
            exam_short = 'unknown'

        # Find matching full exam ID in download state
        full_exam_id = None
        exam_meta = {}
        for eid, details in exam_details.items():
            if details.get('folder_name') == folder_name or eid.startswith(exam_short) or exam_short in eid:
                full_exam_id = eid
                exam_meta = details
                break

        # List image files
        images = sorted([
            f for f in patient_folder.iterdir()
            if f.is_file() and f.suffix.lower() in ('.jpg', '.jpeg', '.png')
        ])

        if not images:
            continue

        patient_name = exam_meta.get('patient_name', clean_name)
        print(f"[{patient_count}/{len(patient_folders)}] {patient_name} ({len(images)} images)")
        sys.stdout.flush()

        # Bytescale folder path for this patient
        bytescale_folder = f"/neuroapp/staging/patients/{sanitize_folder_name(patient_name)}"

        # Init mapping entry
        if folder_name not in progress['patient_mapping']:
            progress['patient_mapping'][folder_name] = {
                'patient_name': patient_name,
                'exam_id': full_exam_id or exam_short,
                'folder_name': folder_name,
                'bytescale_folder': bytescale_folder,
                'images': [],
            }

        patient_data = progress['patient_mapping'][folder_name]

        for image in images:
            total_images += 1
            image_path = str(image.absolute())
            uuid = image.stem

            # Determine type from UUID lookup
            img_type = uuid_type_map.get(uuid, 'UNKNOWN')

            # Safety: skip REDFREE (should not be in downloads, but just in case)
            if img_type == 'REDFREE':
                total_skipped += 1
                print(f"   SKIP REDFREE: {uuid[:12]}")
                sys.stdout.flush()
                continue

            # Already uploaded?
            if image_path in uploaded_set:
                total_skipped += 1
                continue

            if args.dry_run:
                print(f"   DRY-RUN: {image.name} ({img_type})")
                total_uploaded += 1
                continue

            # Upload
            result = upload_file(image, bytescale_folder, image.name)
            if result:
                print(f"   OK {image.name} ({img_type})")
                sys.stdout.flush()
                progress['uploaded_files'].append(image_path)
                uploaded_set.add(image_path)

                patient_data['images'].append({
                    'uuid': uuid,
                    'filename': image.name,
                    'type': img_type,
                    'bytescale_path': result.get('filePath', ''),
                    'bytescale_url': result.get('fileUrl', ''),
                    'cdn_url': f"{CDN_BASE_URL}{result.get('filePath', '')}",
                    'upload_date': datetime.now().isoformat(),
                })
                total_uploaded += 1
            else:
                total_errors += 1

        # Save progress after each patient
        if not args.dry_run:
            save_json(progress, progress_path)

            # Save mapping every 20 patients
            if patient_count % 20 == 0:
                save_json(progress['patient_mapping'], mapping_path)
                print(f"   [Mapping saved at patient {patient_count}]")
                sys.stdout.flush()

    # Final mapping save
    if not args.dry_run:
        save_json(progress['patient_mapping'], mapping_path)
        print(f"\nMapping saved: {mapping_path}")

    # Summary
    print("=" * 65)
    print("  SUMMARY")
    print("=" * 65)
    print(f"  Patient folders:  {patient_count}")
    print(f"  Total images:     {total_images}")
    print(f"  Uploaded:         {total_uploaded}")
    print(f"  Skipped:          {total_skipped}")
    print(f"  Errors:           {total_errors}")
    print("=" * 65)

    if not args.dry_run and total_errors > 0:
        print(f"\n  {total_errors} errors -- re-run to retry failed uploads")
    if args.dry_run:
        print(f"\n  Remove --dry-run to start the actual upload.")

    print(f"\n  Next steps:")
    print(f"    1. Review mapping: {mapping_path}")
    print(f"    2. Import to staging DB")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
