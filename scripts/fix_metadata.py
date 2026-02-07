import asyncio
import os
import json
from pathlib import Path
from datetime import datetime
import argparse
from playwright.async_api import async_playwright
from dotenv import load_dotenv

# Configurações
BASE_URL = "https://ec2.eyercloud.com"
AUTH_STATE_FILE = Path("scripts/eyercloud_downloader/auth_state.json")
STATE_FILE = Path("scripts/eyercloud_downloader/download_state.json")
MAPPING_FILE = Path("scripts/eyercloud_downloader/bytescale_mapping_cleaned.json")
ENV_FILE = Path("scripts/eyercloud_downloader/.env")

# Carrega ENV se existir
if ENV_FILE.exists():
    load_dotenv(str(ENV_FILE))

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
    if not user or not password:
        print("Erro: Credenciais nao encontradas no .env")
        return False
    
    print(f"Tentando login para {user}...")
    await page.goto("https://eyercloud.com/login")
    await page.fill('input[placeholder="Email"]', user)
    await page.fill('input[placeholder="Senha"]', password)
    await page.click('button:has-text("Entrar")')
    try:
        await page.wait_for_url("**/exam", timeout=30000)
        print("Login realizado com sucesso!")
        await page.context.storage_state(path=str(AUTH_STATE_FILE))
        return True
    except:
        print("Falha no login ou timeout.")
        return False

async def fetch_exams(request_context, page_num=1):
    payload = {
        "startDate": "01/01/2000",
        "endDate": "01/01/2050",
        "statusFilter": "all",
        "page": str(page_num)
    }
    response = await request_context.post("https://eyercloud.com/api/v2/eyercloud/exam/filter", data=payload)
    if response.status != 200:
        return {"result": []}
    return await response.json()

async def fetch_exam_details(request_context, exam_id):
    response = await request_context.get(f"https://eyercloud.com/api/v2/eyercloud/examData/list?id={exam_id}")
    if response.status != 200:
        return {}
    return await response.json()

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--force-login', action='store_true', help='Forcar novo login')
    args = parser.parse_args()

    state = load_json(STATE_FILE, {"downloaded_exams": [], "exam_details": {}})
    mapping = load_json(MAPPING_FILE, {})

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # Tenta carregar sessao anterior
        if AUTH_STATE_FILE.exists() and not args.force_login:
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
        else:
            context = await browser.new_context()
        
        page = await context.new_page()
        
        # Verifica se esta logado ou precisa logar
        await page.goto("https://eyercloud.com/exam")
        if "login" in page.url:
            if not await login(page):
                await browser.close()
                return
        
        request_context = context.request
        
        page_num = 1
        all_exams = []
        seen_ids = set()
        
        print("Buscando lista de exames...")
        while page_num <= 10: # Busca as 10 primeiras paginas (suficiente para os novos)
            data = await fetch_exams(request_context, page_num)
            exams = data.get('result', [])
            if not exams: break
            
            new_count = 0
            for e in exams:
                if e['id'] not in seen_ids:
                    seen_ids.add(e['id'])
                    all_exams.append(e)
                    new_count += 1
            
            print(f"  Pagina {page_num}: {len(exams)} exames ({new_count} novos nesta busca)")
            if new_count == 0: break # Ja chegamos em exames conhecidos
            page_num += 1
            await asyncio.sleep(0.5)

        print(f"Total de exames para processar: {len(all_exams)}")
        
        updated_count = 0
        for i, exam in enumerate(all_exams):
            exam_id = exam['id']
            exam_id_short = exam_id[:8]
            
            # Dados básicos
            patient_name = exam.get('patientFullName') or "Desconhecido"
            print(f"[{i+1}/{len(all_exams)}] Processando {patient_name} ({exam_id_short})...")
            
            # Busca detalhes completos (CPF, etc)
            details_resp = await fetch_exam_details(request_context, exam_id)
            full_exam = details_resp.get('exam', {})
            full_patient = full_exam.get('patient', {})
            anamnesis = full_patient.get('anamnesis', {}) or {}
            clinic = full_exam.get('clinic', {})
            
            # Extrai metadados
            cpf = full_patient.get('cpf') or ''
            birthday = full_patient.get('birthday') or ''
            gender = full_patient.get('gender') or ''
            if gender:
                if str(gender).upper() in ['M', 'MALE', 'MASCULINO']: gender = 'male'
                elif str(gender).upper() in ['F', 'FEMALE', 'FEMININO']: gender = 'female'
            
            exam_date = full_exam.get('date') or exam.get('date') or ''
            clinic_name = clinic.get('name') or exam.get('clinicName') or 'Phelcom EyeR Cloud'
            
            # Doencas
            underlying = {
                "diabetes": anamnesis.get('diabetes', full_patient.get('diabetes', False)),
                "hypertension": anamnesis.get('hypertension', full_patient.get('hypertension', False)),
                "cholesterol": anamnesis.get('cholesterol', full_patient.get('cholesterol', False)),
                "smoker": anamnesis.get('smoker', full_patient.get('smoker', False))
            }
            ophthalmic = {
                "diabeticRetinopathy": anamnesis.get('diabeticRetinopathy', full_patient.get('diabeticRetinopathy', False)),
                "dmri": anamnesis.get('dmri', full_patient.get('dmri', False)),
                "glaucoma": anamnesis.get('glaucoma', full_patient.get('glaucoma', False)),
                "cataract": anamnesis.get('cataract', full_patient.get('cataract', False)),
                "pterygium": anamnesis.get('pterygium', full_patient.get('pterygium', False)),
                "lowVisualAcuity": anamnesis.get('lowVisualAcuity', full_patient.get('lowVisualAcuity', False))
            }
            
            # Atualiza no STATE
            # Tenta achar ID longo ou curto
            target_id = None
            if exam_id in state['exam_details']: target_id = exam_id
            else:
                for sid in state['exam_details'].keys():
                    if sid.startswith(exam_id_short):
                        target_id = sid
                        break
            
            if not target_id:
                # Se nao existe, cria entrada basica
                target_id = exam_id
                state['exam_details'][target_id] = {
                    "patient_name": patient_name,
                    "exam_date": exam_date,
                    "clinic_name": clinic_name
                }
            
            state['exam_details'][target_id].update({
                "cpf": cpf,
                "birthday": birthday,
                "gender": gender,
                "underlying_diseases": underlying,
                "ophthalmic_diseases": ophthalmic,
                "otherDisease": full_patient.get('otherDisease') or anamnesis.get('otherDisease', ''),
                "metadata_updated": datetime.now().isoformat()
            })
            
            # Atualiza no MAPPING se existir
            for key in mapping:
                if exam_id_short in key:
                    mapping[key].update({
                        "cpf": cpf,
                        "birthday": birthday,
                        "gender": gender,
                        "underlying_diseases": underlying,
                        "ophthalmic_diseases": ophthalmic,
                        "clinic_name": clinic_name,
                        "exam_date": exam_date
                    })
            
            updated_count += 1
            if i % 10 == 0: # Salva a cada 10 para nao perder progresso
                save_json(STATE_FILE, state)
                save_json(MAPPING_FILE, mapping)

        save_json(STATE_FILE, state)
        save_json(MAPPING_FILE, mapping)
        print(f"Concluido! {updated_count} exames atualizados.")
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
