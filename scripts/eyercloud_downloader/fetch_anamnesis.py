"""
Fetch anamnesis (disease data) from EyerCloud patient API.
Uses POST /patient/list with pagination to get all 451 patients.
Updates download_state.json with real disease data from anamnesis field.

Usage:
    cd scripts/eyercloud_downloader
    python fetch_anamnesis.py
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

STATE_FILE = Path("download_state.json")
ANAMNESIS_FILE = Path("anamnesis_data.json")
AUTH_STATE_FILE = Path("auth_state.json")
BASE_URL = "https://ec2.eyercloud.com"
API_URL = "https://eyercloud.com/api/v2/eyercloud/patient/list"
PAGE_SIZE = 20  # EyerCloud returns 20 per page


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False, default=str), encoding='utf-8')


def normalize(name):
    import unicodedata
    name = name.upper().strip()
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = ' '.join(name.split())
    return name


async def main():
    state = load_state()
    print(f"=== Fetch Anamnesis from EyerCloud Patient API ===\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
            print("Using saved auth session")
        else:
            context = await browser.new_context()
            print("No saved session - will need to login")

        page = await context.new_page()

        # Open EyerCloud login page
        print("Opening EyerCloud...")
        await page.goto(BASE_URL, timeout=60000)

        print("\n" + "=" * 50)
        print("  FACA LOGIN NO NAVEGADOR")
        print("  Voce tem 15 segundos...")
        print("=" * 50 + "\n")

        for i in range(15, 0, -1):
            print(f"  Aguardando... {i}s", end='\r')
            await asyncio.sleep(1)
        print("  Tempo esgotado! Continuando...     ")

        # Save session for next time
        await context.storage_state(path=str(AUTH_STATE_FILE))
        print("Session saved!\n")

        # Fetch all patients page by page
        all_patients = []
        page_num = 1
        total_count = None

        while True:
            print(f"  Fetching page {page_num}...", end=' ')
            try:
                result = await page.evaluate(f"""
                    async () => {{
                        const resp = await fetch('{API_URL}', {{
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

                patients = result.get('result', [])
                if total_count is None:
                    total_count = result.get('totalCount', '?')
                    print(f"Total patients: {total_count}")

                if not patients:
                    print("empty page - done!")
                    break

                all_patients.extend(patients)
                print(f"got {len(patients)} patients (total so far: {len(all_patients)})")

                # If we got fewer than PAGE_SIZE, we're on the last page
                if len(patients) < PAGE_SIZE:
                    break

                page_num += 1
                await asyncio.sleep(0.3)

            except Exception as e:
                print(f"EXCEPTION: {e}")
                break

        print(f"\nFetched {len(all_patients)} patients total\n")

        # Save raw anamnesis data
        anamnesis_map = {}
        for pat in all_patients:
            anamnesis_map[pat['id']] = {
                'name': pat.get('fullName', ''),
                'anamnesis': pat.get('anamnesis', {}),
                'otherDisease': pat.get('otherDisease', ''),
            }
        ANAMNESIS_FILE.write_text(
            json.dumps(anamnesis_map, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )
        print(f"Saved raw anamnesis to {ANAMNESIS_FILE}")

        # Build name -> anamnesis lookup
        name_to_anamnesis = {}
        for pat in all_patients:
            name = pat.get('fullName', '')
            if not name:
                continue
            norm = normalize(name)
            anamnesis = pat.get('anamnesis', {}) or {}
            other = pat.get('otherDisease', '')

            # Keep the one with most diseases
            if norm not in name_to_anamnesis or len(anamnesis) > len(name_to_anamnesis[norm].get('anamnesis', {})):
                name_to_anamnesis[norm] = {
                    'name': name,
                    'anamnesis': anamnesis,
                    'otherDisease': other,
                }

        # Update download_state.json exam_details
        updated = 0
        with_diseases = 0

        for exam_id, detail in state.get('exam_details', {}).items():
            patient_name = detail.get('patient_name', '')
            if not patient_name:
                continue
            norm = normalize(patient_name)
            cloud_data = name_to_anamnesis.get(norm)
            if not cloud_data:
                continue

            anamnesis = cloud_data['anamnesis']

            underlying = {
                "diabetes": bool(anamnesis.get('diabetes', False)),
                "hypertension": bool(anamnesis.get('hypertension', False)),
                "cholesterol": bool(anamnesis.get('cholesterol', False)),
                "smoker": bool(anamnesis.get('smoker', False)),
            }
            ophthalmic = {
                "diabeticRetinopathy": bool(anamnesis.get('diabeticRetinopathy', False)),
                "dmri": bool(anamnesis.get('dmri', False)),
                "glaucoma": bool(anamnesis.get('glaucoma', False)),
                "cataract": bool(anamnesis.get('cataract', False)),
                "pterygium": bool(anamnesis.get('pterygium', False)),
                "lowVisualAcuity": bool(anamnesis.get('lowVisualAcuity', False)),
            }

            has_true = any(underlying.values()) or any(ophthalmic.values())

            old_ud = detail.get('underlying_diseases', {})
            old_od = detail.get('ophthalmic_diseases', {})
            has_changes = (underlying != old_ud or ophthalmic != old_od)

            if has_changes:
                updated += 1

            if has_true:
                with_diseases += 1
                true_ud = [k for k, v in underlying.items() if v]
                true_od = [k for k, v in ophthalmic.items() if v]
                parts = []
                if true_ud:
                    parts.append(f"underlying: {', '.join(true_ud)}")
                if true_od:
                    parts.append(f"ophthalmic: {', '.join(true_od)}")
                marker = ' | '.join(parts)
                if has_changes:
                    print(f"  NEW: {patient_name} -> {marker}")
                else:
                    print(f"  OK:  {patient_name} -> {marker}")

            detail['underlying_diseases'] = underlying
            detail['ophthalmic_diseases'] = ophthalmic
            if cloud_data['otherDisease']:
                detail['otherDisease'] = cloud_data['otherDisease']
            detail['anamnesis_updated'] = datetime.now().isoformat()

        # Final save
        save_state(state)

        print(f"\n=== DONE ===")
        print(f"Patients fetched from API: {len(all_patients)}")
        print(f"Exams updated in state: {updated}")
        print(f"Patients with diseases: {with_diseases}")
        print(f"\nNow run: node scripts/fix_diseases.js")
        print(f"Then:    node scripts/fix_diseases.js --execute")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
