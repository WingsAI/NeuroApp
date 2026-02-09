#!/usr/bin/env python3
"""
Fetch birth dates from EyerCloud patient/list API
Updates download_state.json with birthday field
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
AUTH_STATE_FILE = Path("auth_state.json")
BASE_URL = "https://ec2.eyercloud.com"
API_URL = "https://eyercloud.com/api/v2/eyercloud/patient/list"
PAGE_SIZE = 20

async def fetch_birth_dates():
    """Fetch all patient birth dates from EyerCloud"""

    # Load current state
    with open(STATE_FILE, 'r', encoding='utf-8') as f:
        state = json.load(f)

    print('=== Fetching Birth Dates from EyerCloud ===\n')

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

        # Fetch patient data page by page
        all_patients = []
        page_num = 1
        total_count = None

        while True:
            print(f'  Fetching page {page_num}...', end=' ')
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

    print(f'\nFetched {len(all_patients)} patients total\n')

    # Normalize name function
    def normalize(name):
        import unicodedata
        name = name.upper().strip()
        name = unicodedata.normalize('NFD', name)
        name = ''.join(c for c in name if unicodedata.category(c) != 'Mn')
        name = ' '.join(name.split())
        return name

    # Update download_state with birth dates
    updates_count = 0
    missing_count = 0
    patients_with_birthdays = 0

    for patient in all_patients:
        patient_name = patient.get('fullName', '').strip()
        birthday = patient.get('birthday', '').strip()

        if birthday:
            patients_with_birthdays += 1

        if not patient_name:
            continue

        norm_name = normalize(patient_name)

        # Find matching exam in state by normalized patient name
        matched = False
        for exam_id, exam_data in state['exam_details'].items():
            exam_patient_name = exam_data.get('patient_name', '').strip()
            if not exam_patient_name:
                continue

            exam_norm_name = normalize(exam_patient_name)

            if exam_norm_name == norm_name:
                matched = True
                old_birthday = exam_data.get('birthday', '')

                if birthday and birthday != old_birthday:
                    exam_data['birthday'] = birthday
                    exam_data['birthday_updated'] = datetime.now().isoformat()
                    updates_count += 1
                    print(f'  OK Updated {patient_name}: {birthday}')
                elif not birthday:
                    missing_count += 1

                # Only update first match (patient may have multiple exams)
                break

        if not matched and birthday:
            print(f'  WARNING Patient not found in state: {patient_name} ({birthday})')

    # Save updated state
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

    print(f'\n=== Summary ===')
    print(f'Total patients in EyerCloud: {len(all_patients)}')
    print(f'Patients with birth dates in EyerCloud: {patients_with_birthdays}')
    print(f'Birth dates updated in state: {updates_count}')
    print(f'Patients without birth dates: {missing_count}')
    print(f'\nState file updated: {STATE_FILE}')
    print('\nNext step: Run fix_null_birth_dates.js to sync to database')

if __name__ == '__main__':
    asyncio.run(fetch_birth_dates())
