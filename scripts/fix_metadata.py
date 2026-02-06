"""
Fix Metadata - Corrige todos os metadados faltantes do EyerCloud
================================================================
Este script busca os dados completos dos pacientes diretamente da API do EyerCloud
e atualiza o download_state.json e bytescale_mapping.json com os dados corretos.

Uso:
    python scripts/fix_metadata.py              # Atualiza metadados
    python scripts/fix_metadata.py --dry-run    # Mostra o que seria atualizado
"""

import asyncio
import os
import json
from pathlib import Path
from datetime import datetime
import argparse

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERRO: Playwright não está instalado!")
    print("Execute: pip install playwright && playwright install chromium")
    exit(1)

# Configuração
BASE_URL = "https://ec2.eyercloud.com"
AUTH_STATE_FILE = Path("scripts/eyercloud_downloader/auth_state.json")
STATE_FILE = Path("scripts/eyercloud_downloader/download_state.json")
MAPPING_FILE = Path("scripts/eyercloud_downloader/bytescale_mapping_cleaned.json")


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"downloaded_exams": [], "exam_details": {}}


def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)


def load_mapping():
    if MAPPING_FILE.exists():
        with open(MAPPING_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def save_mapping(mapping):
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=4, ensure_ascii=False)


async def fetch_exam_details(page, exam_id):
    """Busca os detalhes completos de um exame via API."""
    result = await page.evaluate('''async (examId) => {
        const response = await fetch(`https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
            credentials: "include"
        });
        return await response.json();
    }''', exam_id)
    return result


async def fetch_all_exams(page, page_num=1):
    """Busca lista de exames via API de filtro."""
    payload = {
        "startDate": "01/01/2000",
        "endDate": "01/01/2050",
        "statusFilter": "all",
        "page": str(page_num)
    }
    
    result = await page.evaluate('''async (payload) => {
        const response = await fetch("https://eyercloud.com/api/v2/eyercloud/exam/filter", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: new URLSearchParams(payload).toString(),
            credentials: "include"
        });
        return await response.json();
    }''', payload)
    return result


def parse_date(date_str):
    """Parse date string to ISO format."""
    if not date_str:
        return None
    
    # Try different formats
    formats = [
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%d",
        "%d/%m/%Y",
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.replace('+00:00', 'Z').replace('Z', '+0000'), fmt.replace('Z', '+0000'))
            return dt.isoformat()
        except ValueError:
            continue
    
    return date_str


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='Apenas mostra o que seria atualizado')
    parser.add_argument('--patient', type=str, help='Buscar apenas um paciente específico')
    args = parser.parse_args()

    print("=" * 70)
    print("🔧 Fix Metadata - Atualizando dados do EyerCloud")
    print("=" * 70)
    
    if args.dry_run:
        print("⚠️  MODO SIMULAÇÃO - nenhuma alteração será feita\n")
    
    state = load_state()
    mapping = load_mapping()
    
    print(f"📊 Estado atual: {len(state.get('exam_details', {}))} exames no state")
    print(f"📊 Mapping atual: {len(mapping)} entradas no mapping\n")
    
    async with async_playwright() as p:
        if not AUTH_STATE_FILE.exists():
            print("❌ Arquivo auth_state.json não encontrado!")
            print("   Execute primeiro: python scripts/eyercloud_downloader/downloader_playwright.py")
            return
        
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
        page = await context.new_page()
        
        await page.goto(f"{BASE_URL}/exam", wait_until="networkidle")
        await asyncio.sleep(2)
        
        # Verifica se está logado
        if "login" in page.url.lower():
            print("❌ Sessão expirada! Delete auth_state.json e rode o downloader novamente.")
            await browser.close()
            return
        
        print("✅ Conectado ao EyerCloud\n")
        
        # Busca todos os exames
        page_num = 1
        all_exams = []
        all_seen_ids = set()
        
        print("📋 Buscando lista de todos os exames (paginação)...")
        while page_num < 50: # Limite de segurança de 50 páginas (1000 exames)
            data = await fetch_all_exams(page, page_num)
            exams = data.get('result', [])
            
            print(f"   [DEBUG] Página {page_num} retornou {len(exams)} exames.")
            if exams:
                print(f"   [DEBUG] Primeiro ID: {exams[0]['id']}")
            
            if not exams:
                print(f"   Página {page_num} veio vazia. Encerrando busca.")
                break
            
            new_exams = []
            for e in exams:
                if e['id'] not in all_seen_ids:
                    all_seen_ids.add(e['id'])
                    new_exams.append(e)
            
            if not new_exams:
                print(f"   Página {page_num} não trouxe novos exames. Encerrando busca.")
                break
                
            all_exams.extend(new_exams)
            print(f"   Página {page_num}: {len(new_exams)} novos exames (total: {len(all_exams)})")
            
            # Se a página veio com menos de 20 exames, provavelmente é a última
            if len(exams) < 20:
                break
                
            page_num += 1
            await asyncio.sleep(0.5)
        
        print(f"\n📊 Total de exames encontrados na API: {len(all_exams)}\n")
        
        # Processa cada exame
        updated_count = 0
        skipped_count = 0
        
        for i, exam in enumerate(all_exams):
            exam_id = exam['id']
            exam_id_short = exam_id[:8] if len(exam_id) > 8 else exam_id
            
            # Dados básicos do exame da lista
            patient_from_list = exam.get('patient', {})
            patient_name = (
                exam.get('patientFullName') or 
                patient_from_list.get('fullName') or
                patient_from_list.get('name') or
                'Desconhecido'
            )
            
            if args.patient and args.patient.upper() not in patient_name.upper():
                continue
            
            print(f"[{i+1}/{len(all_exams)}] 👤 {patient_name} ({exam_id_short})")
            
            # Busca detalhes completos do exame
            details = await fetch_exam_details(page, exam_id)
            
            exam_obj = details.get('exam', {})
            if not isinstance(exam_obj, dict): exam_obj = {}
            
            patient_obj = exam_obj.get('patient', {})
            if not isinstance(patient_obj, dict): patient_obj = {}
            
            clinic_obj = exam_obj.get('clinic', {})
            if not isinstance(clinic_obj, dict): clinic_obj = {}
            
            anamnesis = patient_obj.get('anamnesis', {}) or {}
            if not isinstance(anamnesis, dict): anamnesis = {}
            
            # Extrai todos os metadados
            cpf = patient_obj.get('cpf') or patient_from_list.get('cpf') or ''
            birthday = patient_obj.get('birthday') or patient_from_list.get('birthday') or ''
            gender = patient_obj.get('gender') or patient_from_list.get('gender') or ''
            
            # Converte gênero
            if gender:
                if str(gender).upper() in ['M', 'MALE', 'MASCULINO']:
                    gender = 'male'
                elif str(gender).upper() in ['F', 'FEMALE', 'FEMININO']:
                    gender = 'female'
            
            exam_date = exam_obj.get('date') or exam.get('date') or ''
            clinic_name = clinic_obj.get('name') or exam.get('clinicName') or 'Phelcom EyeR Cloud'
            
            # Doenças de base
            underlying_diseases = {
                "diabetes": anamnesis.get('diabetes', patient_obj.get('diabetes', False)),
                "hypertension": anamnesis.get('hypertension', patient_obj.get('hypertension', False)),
                "cholesterol": anamnesis.get('cholesterol', patient_obj.get('cholesterol', False)),
                "smoker": anamnesis.get('smoker', patient_obj.get('smoker', False))
            }
            
            # Doenças oftalmológicas
            ophthalmic_diseases = {
                "diabeticRetinopathy": anamnesis.get('diabeticRetinopathy', patient_obj.get('diabeticRetinopathy', False)),
                "dmri": anamnesis.get('dmri', patient_obj.get('dmri', False)),
                "glaucoma": anamnesis.get('glaucoma', patient_obj.get('glaucoma', False)),
                "cataract": anamnesis.get('cataract', patient_obj.get('cataract', False)),
                "pterygium": anamnesis.get('pterygium', patient_obj.get('pterygium', False)),
                "lowVisualAcuity": anamnesis.get('lowVisualAcuity', patient_obj.get('lowVisualAcuity', False))
            }
            
            other_disease = patient_obj.get('otherDisease') or anamnesis.get('otherDisease') or ''
            
            # Mostra dados encontrados
            print(f"   CPF: {cpf or 'N/A'}")
            print(f"   Nascimento: {birthday or 'N/A'}")
            print(f"   Sexo: {gender or 'N/A'}")
            print(f"   Data Exame: {exam_date or 'N/A'}")
            print(f"   Clínica: {clinic_name}")
            if any(underlying_diseases.values()):
                print(f"   Doenças: {[k for k,v in underlying_diseases.items() if v]}")
            
            # Atualiza state
            # Procura o exam_id no state (pode ser curto ou longo)
            target_id = None
            if exam_id in state.get('exam_details', {}):
                target_id = exam_id
            else:
                # Busca por ID que contém o curto
                for sid in state.get('exam_details', {}).keys():
                    if sid.startswith(exam_id) or exam_id in sid:
                        target_id = sid
                        break
            
            if target_id:
                state['exam_details'][target_id].update({
                    'cpf': cpf,
                    'birthday': birthday,
                    'gender': gender,
                    'exam_date': exam_date,
                    'clinic_name': clinic_name,
                    'underlying_diseases': underlying_diseases,
                    'ophthalmic_diseases': ophthalmic_diseases,
                    'otherDisease': other_disease,
                    'metadata_updated': datetime.now().isoformat()
                })
                updated_count += 1
            else:
                skipped_count += 1
            
            # Atualiza mapping - procura pela chave correta
            folder_key = None
            for key in mapping.keys():
                # A chave do mapping geralmente é NOME_IDCURTO
                if exam_id_short in key or (mapping[key].get('exam_id') == exam_id_short):
                    folder_key = key
                    break
            
            if folder_key:
                mapping[folder_key].update({
                    'cpf': cpf,
                    'birthday': birthday,
                    'gender': gender,
                    'exam_date': exam_date,
                    'clinic_name': clinic_name,
                    'underlying_diseases': underlying_diseases,
                    'ophthalmic_diseases': ophthalmic_diseases,
                    'otherDisease': other_disease,
                    'patient_name': patient_name # Atualiza nome se necessário
                })
            
            print()
            await asyncio.sleep(0.05) # Slower wait to avoid rate limit but fast enough
        
        await browser.close()
    
    # Salva arquivos atualizados
    if not args.dry_run:
        save_state(state)
        save_mapping(mapping)
        print(f"\n✅ Arquivos atualizados!")
    
    print(f"\n📊 Resumo:")
    print(f"   Exames atualizados no state: {updated_count}")
    print(f"   Exames não encontrados no state: {skipped_count}")


if __name__ == "__main__":
    asyncio.run(main())
