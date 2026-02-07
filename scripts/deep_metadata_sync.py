import asyncio
import os
import json
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv('scripts/eyercloud_downloader/.env')

STATE_FILE = Path("scripts/eyercloud_downloader/download_state.json")
MAPPING_FILE = Path("scripts/eyercloud_downloader/bytescale_mapping_cleaned.json")

def load_json(path, default):
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)

async def login(page):
    user = os.getenv('EYERCLOUD_USUARIO')
    password = os.getenv('EYERCLOUD_SENHA')
    await page.goto("https://eyercloud.com/login")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Senha"]', password)
    await page.click('button:has-text("Entrar")')
    await page.wait_for_url("**/exam")
    return True

async def fetch_exams(request_context, page_num):
    payload = {
        "startDate": "01/01/2000",
        "endDate": "01/01/2050",
        "statusFilter": "all",
        "page": str(page_num)
    }
    response = await request_context.post("https://eyercloud.com/api/v2/eyercloud/exam/filter", data=payload)
    if response.status == 200:
        return await response.json()
    return {"result": []}

async def main():
    state = load_json(STATE_FILE, {"exam_details": {}})
    mapping = load_json(MAPPING_FILE, {})

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await login(page)
        request_context = context.request
        
        print("Iniciando varredura completa de metadados...")
        
        for page_num in range(1, 26): # 500 exames
            print(f"Buscando pagina {page_num}...")
            data = await fetch_exams(request_context, page_num)
            exams = data.get('result', [])
            if not exams: break
            
            for exam in exams:
                exam_id = exam['id']
                patient = exam.get('patient', {})
                if not isinstance(patient, dict): continue
                
                # Extrai CPF de document2 se cpf estiver vazio
                cpf = patient.get('cpf') or patient.get('document2') or ''
                gender = patient.get('gender') or ''
                if gender.upper() in ['M', 'MASCULINO']: gender = 'male'
                elif gender.upper() in ['F', 'FEMININO']: gender = 'female'
                
                birthday = patient.get('birthday') or ''
                name = patient.get('fullName') or exam.get('patientFullName') or ''
                
                ud = {
                    "diabetes": patient.get('diabetes', False),
                    "hypertension": patient.get('hypertension', False),
                    "cholesterol": patient.get('cholesterol', False),
                    "smoker": patient.get('smoker', False)
                }
                od = {
                    "diabeticRetinopathy": patient.get('diabeticRetinopathy', False),
                    "dmri": patient.get('dmri', False),
                    "glaucoma": patient.get('glaucoma', False),
                    "cataract": patient.get('cataract', False),
                    "pterygium": patient.get('pterygium', False),
                    "lowVisualAcuity": patient.get('lowVisualAcuity', False)
                }

                # Atualiza no STATE (ID longo)
                if exam_id in state['exam_details']:
                    state['exam_details'][exam_id].update({
                        "cpf": cpf,
                        "gender": gender,
                        "birthday": birthday,
                        "underlying_diseases": ud,
                        "ophthalmic_diseases": od,
                        "meta_fix": "2026-02-06"
                    })
                
                # Atualiza no MAPPING (ID curto no folder name)
                short_id = exam_id[:8]
                for key in mapping:
                    if short_id in key:
                        mapping[key].update({
                            "cpf": cpf,
                            "gender": gender,
                            "birthday": birthday,
                            "underlying_diseases": ud,
                            "ophthalmic_diseases": od
                        })
                
                if "ADRIANA" in name.upper() or "ADEMILSON" in name.upper():
                    print(f"  [FOUND] {name}: CPF={cpf}, Gender={gender}")

            save_json(STATE_FILE, state)
            save_json(MAPPING_FILE, mapping)
        
        await browser.close()
        print("Varredura concluida.")

if __name__ == "__main__":
    asyncio.run(main())
