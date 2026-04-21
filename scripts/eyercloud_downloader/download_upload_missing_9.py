"""
Downloads COLOR+ANTERIOR images from EyerCloud CloudFront for the 9 missing-photo exams
(06/02/2026 Campos do Jordão batch) and uploads them to Bytescale.

Writes scripts/eyercloud_downloader/missing_9/upload_result.json with the URL per image
for the DB import step.

Usage:
    cd scripts/eyercloud_downloader
    python download_upload_missing_9.py --preview    # list only
    python download_upload_missing_9.py --execute    # download + upload
"""
import argparse
import json
import mimetypes
import re
import sys
import time
from pathlib import Path

import requests

HERE = Path(__file__).parent
META_FILE = HERE / "missing_9" / "meta.json"
LOCAL_DIR = HERE / "missing_9" / "images"
RESULT_FILE = HERE / "missing_9" / "upload_result.json"

API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"
UPLOAD_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"
CDN_BASE = f"https://upcdn.io/{ACCOUNT_ID}/raw"

REFERER = "https://ec2.eyercloud.com/"


def safe_folder(name: str, exam_id: str) -> str:
    s = re.sub(r'[<>:"/\\|?*]', "_", name).replace(" ", "_")
    return f"{s}_{exam_id[:8]}"


def download_image(data_path: str, uuid: str, dest: Path) -> int:
    if dest.exists() and dest.stat().st_size > 1000:
        return dest.stat().st_size
    url = f"{data_path}/{uuid}"
    r = requests.get(url, headers={"Referer": REFERER, "User-Agent": "Mozilla/5.0"}, timeout=60)
    r.raise_for_status()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(r.content)
    return len(r.content)


def upload_to_bytescale(filepath: Path, folder_path: str, filename: str) -> str:
    mime, _ = mimetypes.guess_type(str(filepath))
    mime = mime or "image/jpeg"
    data = filepath.read_bytes()
    r = requests.post(
        UPLOAD_URL,
        params={"folderPath": folder_path, "fileName": filename},
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": mime, "Content-Length": str(len(data))},
        data=data,
        timeout=120,
    )
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Bytescale upload failed {r.status_code}: {r.text[:300]}")
    j = r.json()
    return j.get("fileUrl") or f"{CDN_BASE}{j['filePath']}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args()

    if not META_FILE.exists():
        print(f"Missing {META_FILE}")
        sys.exit(1)

    meta = json.loads(META_FILE.read_text())
    total_imgs = sum(len(e["images"]) for e in meta)
    print(f"Exams: {len(meta)}, images to process: {total_imgs}")

    if not args.execute:
        for e in meta:
            print(f"  {e['dbName']:40s} {e['eyerCloudId']}  ({len(e['images'])} imgs)")
        print("\n(preview only — pass --execute to download+upload)")
        return

    result = []
    total_ok = 0
    total_fail = 0
    t0 = time.time()

    for ex in meta:
        folder_name = safe_folder(ex["dbName"], ex["eyerCloudId"])
        bytescale_folder = f"/neuroapp/patients/{folder_name}"
        local_folder = LOCAL_DIR / folder_name
        print(f"\n>> {ex['dbName']} ({ex['eyerCloudId']}) -> {bytescale_folder}")

        exam_entry = {
            "dbName": ex["dbName"],
            "eyerCloudId": ex["eyerCloudId"],
            "bytescaleFolder": bytescale_folder,
            "images": [],
        }

        for img in ex["images"]:
            uuid = img["uuid"]
            fname = f"{uuid}.jpg"
            local_path = local_folder / fname
            try:
                size = download_image(ex["dataPath"], uuid, local_path)
                print(f"   downloaded {img['type']:8s} {img['laterality']} {uuid[:8]}… ({size} B)")
                url = upload_to_bytescale(local_path, bytescale_folder, fname)
                print(f"   uploaded  -> {url}")
                exam_entry["images"].append({
                    "uuid": uuid, "type": img["type"], "laterality": img["laterality"],
                    "url": url, "fileName": fname, "imgId": img["imgId"],
                })
                total_ok += 1
            except Exception as ex_err:
                print(f"   FAIL {uuid[:8]}: {ex_err}")
                total_fail += 1

        result.append(exam_entry)

    RESULT_FILE.parent.mkdir(parents=True, exist_ok=True)
    RESULT_FILE.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    dt = time.time() - t0
    print(f"\nDone in {dt:.1f}s. ok={total_ok} fail={total_fail}. Written: {RESULT_FILE}")


if __name__ == "__main__":
    main()
