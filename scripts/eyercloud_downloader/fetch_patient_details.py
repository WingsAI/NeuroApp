#!/usr/bin/env python3
"""
Fetch full patient details (CPF, gender, birthday) from EyerCloud patient/list API.

The exam endpoint (/examData/list) does NOT reliably return CPF and gender.
The patient endpoint (/patient/list) has the complete data.

This script fetches ALL fields from the patient endpoint and saves to patient_details.json.
Also updates download_state.json with cpf/gender for each exam.

Usage:
    cd scripts/eyercloud_downloader
    python fetch_patient_details.py
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
DETAILS_FILE = Path("patient_details.json")
AUTH_STATE_FILE = Path("auth_state.json")
BASE_URL = "https://ec2.eyercloud.com"
API_URL = "https://eyercloud.com/api/v2/eyercloud/patient/list"
PAGE_SIZE = 20  # EyerCloud returns 20 per page


def normalize(name):
    import unicodedata
    name = name.upper().strip()
    name = unicodedata.normalize('NFD', name)
    name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
    name = ' '.join(name.split())
    return name


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    return {}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2, ensure_ascii=False, default=str), encoding='utf-8')


async def main():
    state = load_state()
    print(f"=== Fetch Patient Details from EyerCloud Patient API ===\n")

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

        print("\n" + "=" * 60)
        print("  FACA LOGIN NO NAVEGADOR")
        print("  Voce tem 30 segundos...")
        print("=" * 60 + "\n")

        for i in range(30, 0, -1):
            print(f"  Aguardando... {i}s", end='\r')
            await asyncio.sleep(1)
        print("  Tempo esgotado! Continuando...     ")

        # Save session for next time
        await context.storage_state(path=str(AUTH_STATE_FILE))
        print("Session saved!\n")

        # Navigate to exams page to ensure session is active
        print("Navigating to exams page...")
        await page.goto("https://eyercloud.com/exams", timeout=60000)
        await asyncio.sleep(2)
        print("Ready to fetch data!\n")

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

        await browser.close()

    print(f"\nFetched {len(all_patients)} patients total\n")

    # Save full patient details
    details_map = {}
    with_cpf = 0
    with_gender = 0
    with_birthday = 0

    for pat in all_patients:
        pat_id = pat.get('id', '')
        name = pat.get('fullName', '').strip()
        # CPF is stored in 'document2' field, NOT 'cpf' (which doesn't exist in the API)
        cpf = pat.get('document2', '').strip() if pat.get('document2') else ''
        gender = pat.get('gender', '').strip() if pat.get('gender') else ''
        birthday = pat.get('birthday', '').strip() if pat.get('birthday') else ''
        anamnesis = pat.get('anamnesis', {}) or {}
        other_disease = pat.get('otherDisease', '').strip() if pat.get('otherDisease') else ''

        if cpf:
            with_cpf += 1
        if gender:
            with_gender += 1
        if birthday:
            with_birthday += 1

        details_map[pat_id] = {
            'name': name,
            'cpf': cpf,
            'gender': gender,
            'birthday': birthday,
            'anamnesis': anamnesis,
            'otherDisease': other_disease,
        }

    DETAILS_FILE.write_text(
        json.dumps(details_map, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    print(f"Saved {len(details_map)} patients to {DETAILS_FILE}")
    print(f"  With CPF: {with_cpf}")
    print(f"  With gender: {with_gender}")
    print(f"  With birthday: {with_birthday}\n")

    # Update download_state.json with cpf/gender from patient endpoint
    name_to_details = {}
    for pat_id, detail in details_map.items():
        name = detail['name']
        if not name:
            continue
        norm = normalize(name)
        # Keep the one with most data (prefer entries with cpf and gender)
        existing = name_to_details.get(norm)
        if not existing:
            name_to_details[norm] = detail
        else:
            # Prefer the one with more non-empty fields
            new_score = bool(detail['cpf']) + bool(detail['gender']) + bool(detail['birthday'])
            old_score = bool(existing['cpf']) + bool(existing['gender']) + bool(existing['birthday'])
            if new_score > old_score:
                name_to_details[norm] = detail

    # Update exam_details in state
    cpf_updated = 0
    gender_updated = 0
    birthday_updated = 0

    for exam_id, exam_data in state.get('exam_details', {}).items():
        patient_name = exam_data.get('patient_name', '')
        if not patient_name:
            continue
        norm = normalize(patient_name)
        cloud_data = name_to_details.get(norm)
        if not cloud_data:
            continue

        changed = False

        # Update CPF if missing or empty
        old_cpf = exam_data.get('cpf', '').strip()
        new_cpf = cloud_data['cpf']
        if new_cpf and not old_cpf:
            exam_data['cpf'] = new_cpf
            cpf_updated += 1
            changed = True
            print(f"  CPF: {patient_name} -> {new_cpf}")

        # Update gender if missing or empty
        old_gender = exam_data.get('gender', '').strip()
        new_gender = cloud_data['gender']
        if new_gender and not old_gender:
            exam_data['gender'] = new_gender
            gender_updated += 1
            changed = True
            print(f"  GENDER: {patient_name} -> {new_gender}")

        # Update birthday if missing or empty
        old_birthday = exam_data.get('birthday', '').strip()
        new_birthday = cloud_data['birthday']
        if new_birthday and not old_birthday:
            exam_data['birthday'] = new_birthday
            birthday_updated += 1
            changed = True
            print(f"  BIRTHDAY: {patient_name} -> {new_birthday}")

        if changed:
            exam_data['patient_details_updated'] = datetime.now().isoformat()

    # Save updated state
    save_state(state)

    print(f"\n=== SUMMARY ===")
    print(f"Patients fetched from API: {len(all_patients)}")
    print(f"CPF updated in state: {cpf_updated}")
    print(f"Gender updated in state: {gender_updated}")
    print(f"Birthday updated in state: {birthday_updated}")
    print(f"\nFiles updated:")
    print(f"  {DETAILS_FILE}")
    print(f"  {STATE_FILE}")
    print(f"\nNext step: node scripts/fix_cpf_gender.js")
    print(f"Then:      node scripts/fix_cpf_gender.js --execute")


if __name__ == "__main__":
    asyncio.run(main())
