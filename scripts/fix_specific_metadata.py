import asyncio
import os
import json
from pathlib import Path
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv('scripts/eyercloud_downloader/.env')

async def fetch_exam_details(request_context, exam_id):
    url = f"https://eyercloud.com/api/v2/eyercloud/examData/list?id={exam_id}"
    response = await request_context.get(url)
    if response.status == 200:
        return await response.json()
    return {}

async def fetch_patient_details(request_context, patient_id):
    url = f"https://eyercloud.com/api/v2/eyercloud/patient/list?id={patient_id}"
    response = await request_context.get(url)
    if response.status == 200:
        data = await response.json()
        return data.get('patient', {})
    return {}

async def main():
    state_path = Path('scripts/eyercloud_downloader/download_state.json')
    with open(state_path, 'r', encoding='utf-8') as f:
        state = json.load(f)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        user = os.getenv('EYERCLOUD_USUARIO')
        password = os.getenv('EYERCLOUD_SENHA')
        
        print(f"Logging in as {user}...")
        await page.goto("https://eyercloud.com/login")
        await page.fill('input[placeholder="Email"]', user)
        await page.fill('input[placeholder="Senha"]', password)
        await page.click('button:has-text("Entrar")')
        await page.wait_for_url("**/exam")
        
        request_context = context.request
        
        # Patients to target
        target_names = ["ADRIANA CARVALHO FERNANDES", "ADEMILSON ROGERIO GIRIOLI"]
        
        for exam_id, details in state['exam_details'].items():
            name = details.get('patient_name', '')
            if any(target in name.upper() for target in target_names):
                print(f"Updating metadata for {name} ({exam_id})...")
                
                # Step 1: Get Exam info to get patient ID
                exam_resp = await fetch_exam_details(request_context, exam_id)
                exam_info = exam_resp.get('exam', {})
                patient_id = exam_info.get('patient')
                
                if not patient_id:
                    print(f"  Patient ID not found for {name}")
                    continue
                
                # Step 2: Get Patient full info
                patient_info = await fetch_patient_details(request_context, patient_id)
                anamnesis = patient_info.get('anamnesis', {}) or {}
                
                cpf = patient_info.get('cpf') or ''
                gender = patient_info.get('gender') or ''
                
                print(f"  Found CPF: {cpf}, Gender: {gender}")
                
                underlying = {
                    "diabetes": anamnesis.get('diabetes', patient_info.get('diabetes', False)),
                    "hypertension": anamnesis.get('hypertension', patient_info.get('hypertension', False)),
                    "cholesterol": anamnesis.get('cholesterol', patient_info.get('cholesterol', False)),
                    "smoker": anamnesis.get('smoker', patient_info.get('smoker', False))
                }
                
                details['cpf'] = cpf
                details['gender'] = gender
                details['underlying_diseases'] = underlying
                details['last_metadata_fix'] = "2026-02-06"

        with open(state_path, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
            
        print("Done updating download_state.json")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
