import asyncio
import os
import json
from playwright.async_api import async_playwright
from dotenv import load_dotenv
from tqdm.asyncio import tqdm

# Load configuration
load_dotenv('scripts/eyercloud_downloader/.env')

EYERCLOUD_USUARIO = os.getenv('EYERCLOUD_USUARIO')
EYERCLOUD_SENHA = os.getenv('EYERCLOUD_SENHA')
EYERCLOUD_DOMAIN = os.getenv('EYERCLOUD_DOMAIN', 'https://eyercloud.com')
STATE_FILE = "scripts/eyercloud_downloader/download_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"downloaded_exams": [], "exam_details": {}}

def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)

async def login(page):
    print(f'Attempting login at {EYERCLOUD_DOMAIN}')
    await page.goto(f"{EYERCLOUD_DOMAIN}/login")
    await page.get_by_placeholder("Email").fill(EYERCLOUD_USUARIO)
    await page.get_by_placeholder("Senha").fill(EYERCLOUD_SENHA)
    await page.get_by_placeholder("Senha").press("Enter")
    await page.wait_for_url("**/exam", timeout=60000)
    print('Login successful.')
    return page

async def fetch_exams(request_context, page_num=1):
    payload = {
        "startDate": "01/01/2000",
        "endDate": "01/01/2050",
        "statusFilter": "all",
        "page": str(page_num)
    }
    response = await request_context.post(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/exam/filter", data=payload)
    return await response.json()

async def main():
    state = load_state()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale='pt-BR')
        page = await context.new_page()
        
        await login(page)
        request_context = context.request
        
        page_num = 1
        all_seen_ids = set()
        updated_count = 0
        disease_found_count = 0
        
        while True:
            print(f"Checking page {page_num}...")
            data = await fetch_exams(request_context, page_num)
            exams = data.get('result', [])
            if not exams:
                break
                
            current_page_ids = {e['id'] for e in exams}
            if current_page_ids.issubset(all_seen_ids):
                break
            all_seen_ids.update(current_page_ids)
            
            for exam in exams:
                exam_id = exam['id']
                patient_data = exam.get('patient', {})
                anamnesis = patient_data.get('anamnesis') or {}
                
                # Check if we have anything to update
                has_anamnesis = any(anamnesis.values()) if isinstance(anamnesis, dict) else False
                
                if exam_id in state['exam_details']:
                    details = state['exam_details'][exam_id]
                    
                    # Update disease info
                    ud = {
                        "diabetes": anamnesis.get('diabetes', patient_data.get('diabetes', False)),
                        "hypertension": anamnesis.get('hypertension', patient_data.get('hypertension', False)),
                        "cholesterol": anamnesis.get('cholesterol', patient_data.get('cholesterol', False)),
                        "smoker": anamnesis.get('smoker', patient_data.get('smoker', False))
                    }
                    od = {
                        "diabeticRetinopathy": anamnesis.get('diabeticRetinopathy', patient_data.get('diabeticRetinopathy', False)),
                        "dmri": anamnesis.get('dmri', patient_data.get('dmri', False)),
                        "glaucoma": anamnesis.get('glaucoma', patient_data.get('glaucoma', False)),
                        "cataract": anamnesis.get('cataract', patient_data.get('cataract', False)),
                        "pterygium": anamnesis.get('pterygium', patient_data.get('pterygium', False)),
                        "lowVisualAcuity": anamnesis.get('lowVisualAcuity', patient_data.get('lowVisualAcuity', False))
                    }
                    
                    # Log if we found actual diseases
                    if any(ud.values()) or any(od.values()):
                        disease_found_count += 1
                        print(f"Found disease data for {details.get('patient_name')}: {ud}")
                    
                    details['underlying_diseases'] = ud
                    details['ophthalmic_diseases'] = od
                    details['otherDisease'] = patient_data.get('otherDisease') or anamnesis.get('otherDisease')
                    updated_count += 1
                
            page_num += 1
            save_state(state) # Save frequently
            await asyncio.sleep(0.5)

        await browser.close()
        print(f"\nMetadata update finished! Updated {updated_count} exams.")
        print(f"Found non-empty disease data for {disease_found_count} patients.")

if __name__ == "__main__":
    asyncio.run(main())
