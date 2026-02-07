"""
fetch_image_types.py - Busca os tipos reais de cada imagem na API EyerCloud
=============================================================================

Para cada exame no download_state.json, chama a API /examData/list e salva
o tipo (COLOR, REDFREE, ANTERIOR) de cada imagem por UUID.

Gera image_types.json: { exam_id: { uuid: type, ... }, ... }

Uso:
    cd scripts/eyercloud_downloader
    python fetch_image_types.py
"""

import asyncio
import json
import os
import time
from pathlib import Path
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv()

EYERCLOUD_USUARIO = os.getenv('EYERCLOUD_USUARIO')
EYERCLOUD_SENHA = os.getenv('EYERCLOUD_SENHA')
EYERCLOUD_DOMAIN = os.getenv('EYERCLOUD_DOMAIN', 'https://eyercloud.com')

STATE_FILE = Path("download_state.json")
OUTPUT_FILE = Path("image_types.json")


async def fetch_exam_details(page, exam_id):
    """Busca os detalhes de um exame via API."""
    result = await page.evaluate('''async (examId) => {
        const response = await fetch(`https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
            credentials: "include"
        });
        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            return { examDataList: [], error: text.substring(0, 200) };
        }
    }''', exam_id)
    return result


async def main():
    # Load state
    with open(STATE_FILE, 'r', encoding='utf-8') as f:
        state = json.load(f)

    exam_ids = list(state.get('exam_details', {}).keys())
    print(f"Total exams in state: {len(exam_ids)}")

    # Load existing progress
    if OUTPUT_FILE.exists():
        with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
            image_types = json.load(f)
        print(f"Resuming: {len(image_types)} exams already fetched")
    else:
        image_types = {}

    # Filter remaining
    remaining = [eid for eid in exam_ids if eid not in image_types]
    print(f"Remaining to fetch: {len(remaining)}")

    if not remaining:
        print("All done!")
        print_summary(image_types)
        return

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        # Login
        print(f'Logging in to {EYERCLOUD_DOMAIN}...')
        await page.goto(f"{EYERCLOUD_DOMAIN}/login")
        await page.get_by_placeholder("Email").fill(EYERCLOUD_USUARIO)
        await page.get_by_placeholder("Senha").fill(EYERCLOUD_SENHA)
        await page.get_by_placeholder("Senha").press("Enter")
        await page.wait_for_url("**/exam", timeout=30000)
        print("Logged in!")

        errors = []
        for i, exam_id in enumerate(remaining):
            patient_name = state['exam_details'][exam_id].get('patient_name', '?')
            try:
                data = await fetch_exam_details(page, exam_id)
                exam_data_list = data.get('examDataList', [])

                types = {}
                for img in exam_data_list:
                    uuid = img.get('uuid', img.get('name', ''))
                    img_type = img.get('type', 'UNKNOWN')
                    if uuid:
                        types[uuid] = img_type

                image_types[exam_id] = types

                type_counts = {}
                for t in types.values():
                    type_counts[t] = type_counts.get(t, 0) + 1
                counts_str = ", ".join(f"{t}:{c}" for t, c in sorted(type_counts.items()))

                print(f"  [{i+1}/{len(remaining)}] {patient_name[:30]:<30} | {len(types)} imgs | {counts_str}")

            except Exception as e:
                errors.append({'exam_id': exam_id, 'error': str(e)[:100]})
                print(f"  [{i+1}/{len(remaining)}] ERROR {patient_name}: {str(e)[:80]}")

            # Save progress every 20 exams
            if (i + 1) % 20 == 0:
                with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
                    json.dump(image_types, f, indent=2, ensure_ascii=False)
                print(f"  ... saved progress ({len(image_types)} exams)")

            # Small delay to not overwhelm the API
            await asyncio.sleep(0.3)

        await browser.close()

    # Final save
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(image_types, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Fetched {len(image_types)} exams total.")
    if errors:
        print(f"Errors: {len(errors)}")
        for e in errors:
            print(f"  {e['exam_id']}: {e['error']}")

    print_summary(image_types)


def print_summary(image_types):
    """Print summary of image types across all exams."""
    total_types = {}
    total_images = 0
    for exam_id, types in image_types.items():
        for uuid, t in types.items():
            total_types[t] = total_types.get(t, 0) + 1
            total_images += 1

    print(f"\n=== SUMMARY ===")
    print(f"Exams fetched: {len(image_types)}")
    print(f"Total images: {total_images}")
    for t, c in sorted(total_types.items(), key=lambda x: -x[1]):
        pct = c / total_images * 100 if total_images else 0
        print(f"  {t}: {c} ({pct:.1f}%)")


if __name__ == "__main__":
    asyncio.run(main())
