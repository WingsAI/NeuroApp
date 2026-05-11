#!/usr/bin/env python3
"""
Upload Atibaia images (downloaded by download_staging_images.py) to Bytescale.

Reads from:  downloads_staging/prevavcatibaia/PATIENT_EXAMID/UUID.jpg
Writes to:   /neuroapp/patients/<sanitized_folder>/UUID.jpg on Bytescale
Output:      atibaia_bytescale_mapping.json — maps uuid -> {url, exam_id, patient}

Usage:
    python upload_atibaia.py             # actual upload
    python upload_atibaia.py --dry-run   # simulate
"""
import os
import json
import re
import argparse
import mimetypes
from pathlib import Path
from datetime import datetime

import requests

API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"
UPLOAD_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"

DOWNLOAD_DIR = Path("downloads_staging/prevavcatibaia")
STATE_FILE = Path("atibaia_upload_state.json")
MAPPING_FILE = Path("atibaia_bytescale_mapping.json")
STAGING_STATE = Path("staging_state_prevavcatibaia.json")


def sanitize(name):
    return re.sub(r'[^a-zA-Z0-9_-]', '_', name).strip('_')


def load_json(p, default):
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default


def save_json(p, data):
    p.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')


def upload_file(filepath, folder_path, filename):
    mime = mimetypes.guess_type(str(filepath))[0] or 'image/jpeg'
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": mime,
    }
    params = {"fileName": filename, "folderPath": folder_path}
    with open(filepath, 'rb') as f:
        data = f.read()
    try:
        r = requests.post(UPLOAD_URL, headers=headers, params=params, data=data, timeout=120)
        if r.status_code in (200, 201):
            return r.json()
        print(f"   ❌ HTTP {r.status_code}: {r.text[:200]}")
        return None
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()

    print("=" * 60)
    print(f"  Atibaia Bytescale Upload {'(DRY-RUN)' if args.dry_run else ''}")
    print("=" * 60)

    if not DOWNLOAD_DIR.exists():
        print(f"❌ Download dir não encontrado: {DOWNLOAD_DIR}")
        return

    # Load staging state to map UUID -> exam_id + filter image types
    staging = load_json(STAGING_STATE, {})
    # Build uuid -> (exam_id, type, laterality, patient_name)
    uuid_meta = {}
    for eid, imgs in staging.get('exam_images', {}).items():
        patient_name = staging.get('exams', {}).get(eid, {}).get('patientName', '')
        for img in imgs:
            uuid = img.get('uuid')
            if uuid:
                uuid_meta[uuid] = {
                    'exam_id': eid,
                    'type': img.get('type', 'UNKNOWN'),
                    'laterality': img.get('laterality', ''),
                    'patient_name': patient_name,
                }

    state = load_json(STATE_FILE, {'uploaded': {}})  # uuid -> {url, path, uploaded_at}
    mapping = load_json(MAPPING_FILE, {})  # exam_id -> [{uuid, type, url, ...}]

    folders = sorted([f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()])
    print(f"📁 {len(folders)} pastas de pacientes\n")

    total = uploaded = skipped = errors = filtered = 0
    for idx, folder in enumerate(folders, 1):
        images = [f for f in folder.iterdir() if f.is_file() and f.suffix.lower() in ('.jpg', '.jpeg', '.png')]
        if not images:
            continue

        print(f"[{idx}/{len(folders)}] {folder.name} ({len(images)} imgs)")
        bytescale_folder = f"/neuroapp/patients/atibaia/{sanitize(folder.name)}"

        for img in images:
            total += 1
            uuid = img.stem
            meta = uuid_meta.get(uuid, {})
            img_type = meta.get('type', 'UNKNOWN')

            # Filter: only COLOR + ANTERIOR (skip REDFREE/RETINA_INFRA_RED/etc.)
            if img_type not in ('COLOR', 'ANTERIOR'):
                filtered += 1
                continue

            if uuid in state['uploaded']:
                skipped += 1
                continue

            if args.dry_run:
                print(f"   📤 [SIM] {uuid[:12]}... ({img_type})")
                uploaded += 1
                continue

            result = upload_file(img, bytescale_folder, img.name)
            if result and result.get('fileUrl'):
                url = result['fileUrl']
                state['uploaded'][uuid] = {
                    'url': url,
                    'path': result.get('filePath'),
                    'type': img_type,
                    'laterality': meta.get('laterality', ''),
                    'exam_id': meta.get('exam_id', ''),
                    'uploaded_at': datetime.now().isoformat(),
                }
                uploaded += 1
                print(f"   ✅ {uuid[:12]}... ({img_type})")
            else:
                errors += 1

        if not args.dry_run and idx % 10 == 0:
            save_json(STATE_FILE, state)

    # Build mapping by exam_id
    if not args.dry_run:
        mapping = {}
        for uuid, data in state['uploaded'].items():
            eid = data.get('exam_id') or uuid_meta.get(uuid, {}).get('exam_id', '')
            if not eid:
                continue
            mapping.setdefault(eid, []).append({
                'uuid': uuid,
                'type': data['type'],
                'laterality': data.get('laterality', ''),
                'url': data['url'],
                'path': data['path'],
            })
        save_json(STATE_FILE, state)
        save_json(MAPPING_FILE, mapping)

    print("\n" + "=" * 60)
    print(f"  Total: {total} | Uploaded: {uploaded} | Skipped: {skipped} | Filtered: {filtered} | Errors: {errors}")
    print(f"  State:   {STATE_FILE}")
    print(f"  Mapping: {MAPPING_FILE}")
    print("=" * 60)


if __name__ == '__main__':
    main()
