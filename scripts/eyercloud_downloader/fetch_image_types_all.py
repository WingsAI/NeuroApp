#!/usr/bin/env python3
"""
Fetch image types for ALL exams from EyerCloud API.
Updates image_types.json with UUID -> type mapping for every image.

This replaces the old fetch_image_types.py which only covered ~400 exams.

Usage:
    cd scripts/eyercloud_downloader
    python fetch_image_types_all.py
"""

import asyncio
import json
from pathlib import Path
from datetime import datetime

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright && playwright install chromium")
    exit(1)

TYPES_FILE = Path("image_types.json")
AUTH_STATE_FILE = Path("auth_state.json")
BASE_URL = "https://ec2.eyercloud.com"
EXAM_API_URL = "https://eyercloud.com/api/v2/eyercloud/exam/list"
EXAMDATA_API_URL = "https://eyercloud.com/api/v2/eyercloud/examData/list"
PAGE_SIZE = 20


async def main():
    # Load existing types
    existing_types = {}
    if TYPES_FILE.exists():
        existing_types = json.loads(TYPES_FILE.read_text(encoding='utf-8'))
    print(f"Existing image_types.json has {len(existing_types)} entries\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
            print("Using saved auth session")
        else:
            context = await browser.new_context()
            print("No saved session - will need to login")

        page = await context.new_page()

        print("Opening EyerCloud...")
        await page.goto(BASE_URL, timeout=60000)

        print("\n" + "=" * 60)
        print("  FACA LOGIN NO NAVEGADOR")
        print("  Voce tem 30 segundos...")
        print("=" * 60 + "\n")

        for i in range(30, 0, -1):
            print(f"  Aguardando... {i}s", end='\r')
            await asyncio.sleep(1)
        print("  Tempo esgotado! Continuando...     ")

        await context.storage_state(path=str(AUTH_STATE_FILE))
        print("Session saved!\n")

        # Navigate to exams page
        print("Navigating to exams page...")
        await page.goto("https://eyercloud.com/exams", timeout=60000)
        await asyncio.sleep(2)

        # Step 1: Fetch all exam IDs
        print("=== Step 1: Fetching all exam IDs ===\n")
        all_exams = []
        page_num = 1

        while True:
            print(f"  Fetching exam page {page_num}...", end=' ')
            try:
                result = await page.evaluate(f"""
                    async () => {{
                        const resp = await fetch('{EXAM_API_URL}', {{
                            method: 'POST',
                            credentials: 'include',
                            headers: {{'Content-Type': 'application/json'}},
                            body: JSON.stringify({{page: {page_num}}})
                        }});
                        if (!resp.ok) return {{ error: resp.status }};
                        return await resp.json();
                    }}
                """)

                if isinstance(result, dict) and 'error' in result:
                    print(f"ERROR {result['error']}")
                    break

                exams = result.get('result', [])
                if not exams:
                    print("empty page - done!")
                    break

                for exam in exams:
                    all_exams.append({
                        'id': exam['id'],
                        'patient': exam.get('patient', {}).get('fullName', '') if isinstance(exam.get('patient'), dict) else str(exam.get('patient', '')),
                    })

                print(f"got {len(exams)} exams (total: {len(all_exams)})")

                if len(exams) < PAGE_SIZE:
                    break
                page_num += 1
                await asyncio.sleep(0.3)

            except Exception as e:
                print(f"EXCEPTION: {e}")
                break

        print(f"\nTotal exams found: {len(all_exams)}\n")

        # Step 2: For each exam, fetch image types
        print("=== Step 2: Fetching image types per exam ===\n")
        all_types = dict(existing_types)  # Start with existing
        new_count = 0
        redfree_count = 0
        color_count = 0
        anterior_count = 0
        errors = 0

        for i, exam in enumerate(all_exams):
            exam_id = exam['id']
            patient = exam['patient']

            print(f"  [{i+1}/{len(all_exams)}] {patient[:40]:40s} ({exam_id})...", end=' ')

            try:
                result = await page.evaluate(f"""
                    async () => {{
                        const resp = await fetch('{EXAMDATA_API_URL}?id={exam_id}', {{
                            method: 'POST',
                            credentials: 'include',
                            headers: {{'Content-Type': 'application/json'}},
                            body: '{{}}'
                        }});
                        if (!resp.ok) return {{ error: resp.status }};
                        return await resp.json();
                    }}
                """)

                if isinstance(result, dict) and 'error' in result:
                    print(f"ERROR {result['error']}")
                    errors += 1
                    continue

                images = result.get('examDataList', [])
                exam_new = 0
                for img in images:
                    uuid = img.get('uuid', '')
                    img_type = img.get('type', 'UNKNOWN')
                    if uuid and uuid not in all_types:
                        all_types[uuid] = img_type
                        new_count += 1
                        exam_new += 1

                    if img_type == 'REDFREE':
                        redfree_count += 1
                    elif img_type == 'COLOR':
                        color_count += 1
                    elif img_type == 'ANTERIOR':
                        anterior_count += 1

                print(f"{len(images)} images ({exam_new} new)")

                # Save periodically every 50 exams
                if (i + 1) % 50 == 0:
                    TYPES_FILE.write_text(json.dumps(all_types, indent=2, ensure_ascii=False), encoding='utf-8')
                    print(f"    [saved {len(all_types)} entries]")

                await asyncio.sleep(0.2)

            except Exception as e:
                print(f"EXCEPTION: {e}")
                errors += 1

        await browser.close()

    # Final save
    TYPES_FILE.write_text(json.dumps(all_types, indent=2, ensure_ascii=False), encoding='utf-8')

    print(f"\n=== SUMMARY ===")
    print(f"Total exams processed: {len(all_exams)}")
    print(f"Total image types in file: {len(all_types)}")
    print(f"New types added: {new_count}")
    print(f"Errors: {errors}")
    print(f"\nImage counts (this run):")
    print(f"  COLOR: {color_count}")
    print(f"  ANTERIOR: {anterior_count}")
    print(f"  REDFREE: {redfree_count}")
    print(f"\nSaved to {TYPES_FILE}")
    print(f"\nNext step: node scripts/fix_image_types.js")
    print(f"Then:      node scripts/fix_image_types.js --execute")


if __name__ == "__main__":
    asyncio.run(main())
