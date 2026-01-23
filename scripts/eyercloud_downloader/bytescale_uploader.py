"""
Bytescale Uploader - Upload images to Bytescale cloud storage
==============================================================
Este script faz upload das imagens baixadas do EyerCloud para o Bytescale,
organizando por paciente e gerando um mapeamento de URLs.

Uso:
    python bytescale_uploader.py              # Faz upload de todas as imagens
    python bytescale_uploader.py --dry-run    # Simula sem fazer upload
"""

import os
import json
import requests
from pathlib import Path
from datetime import datetime
import mimetypes
import re

# --- CONFIGURAÇÃO BYTESCALE ---
# Extrair Account ID da API key (formato: public_W142icY...)
# O Account ID é "W142icY" (os 7 caracteres após "public_" ou "secret_")
API_KEY = "secret_W142icY3yUHGu9PToLGZuBAkGH58"
ACCOUNT_ID = "W142icY"  # Extraído da API key

UPLOAD_BASE_URL = f"https://api.bytescale.com/v2/accounts/{ACCOUNT_ID}/uploads/binary"
CDN_BASE_URL = f"https://upcdn.io/{ACCOUNT_ID}/raw"

# --- CONFIGURAÇÃO LOCAL ---
DOWNLOAD_DIR = Path("downloads")
STATE_FILE = Path("bytescale_upload_state.json")
MAPPING_FILE = Path("bytescale_mapping.json")


def load_state():
    """Carrega o estado de uploads anteriores."""
    if STATE_FILE.exists():
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {"uploaded_files": [], "patient_mapping": {}}


def save_state(state):
    """Salva o estado atual de uploads."""
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)


def save_mapping(state):
    """Salva o mapeamento de pacientes para URLs."""
    mapping = state.get('patient_mapping', {})
    with open(MAPPING_FILE, 'w', encoding='utf-8') as f:
        json.dump(mapping, f, indent=4, ensure_ascii=False)
    print(f"📄 Mapeamento salvo em: {MAPPING_FILE.absolute()}")


def sanitize_folder_name(name):
    """Remove caracteres especiais do nome da pasta."""
    # Remove caracteres que podem causar problemas em URLs
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', name)
    safe_name = safe_name.replace(' ', '_')
    return safe_name


def get_mime_type(filepath):
    """Retorna o MIME type do arquivo."""
    mime_type, _ = mimetypes.guess_type(str(filepath))
    return mime_type or 'application/octet-stream'


def upload_file(filepath, folder_path, filename):
    """Faz upload de um arquivo para o Bytescale."""
    url = UPLOAD_BASE_URL
    
    params = {
        'folderPath': folder_path,
        'fileName': filename
    }
    
    headers = {
        'Authorization': f'Bearer {API_KEY}',
        'Content-Type': get_mime_type(filepath)
    }
    
    with open(filepath, 'rb') as f:
        file_data = f.read()
    
    headers['Content-Length'] = str(len(file_data))
    
    response = requests.post(url, params=params, headers=headers, data=file_data)
    
    if response.status_code in [200, 201]:
        return response.json()
    else:
        print(f"      ❌ Erro {response.status_code}: {response.text[:200]}")
        return None


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Bytescale Uploader')
    parser.add_argument('--dry-run', action='store_true', help='Simula sem fazer upload')
    args = parser.parse_args()
    
    print("=" * 60)
    print("☁️ Bytescale Uploader - EyerCloud Images")
    print("=" * 60)
    
    if args.dry_run:
        print("⚠️ MODO SIMULAÇÃO (--dry-run) - Nenhum upload será feito\n")
    
    state = load_state()
    
    if not DOWNLOAD_DIR.exists():
        print(f"❌ Pasta de downloads não encontrada: {DOWNLOAD_DIR}")
        return
    
    # Conta total de imagens
    total_images = 0
    total_uploaded = 0
    total_skipped = 0
    total_errors = 0
    
    # Lista todas as pastas de pacientes
    patient_folders = [f for f in DOWNLOAD_DIR.iterdir() if f.is_dir()]
    
    print(f"📁 Encontradas {len(patient_folders)} pastas de pacientes\n")
    
    for patient_folder in sorted(patient_folders):
        patient_name = patient_folder.name
        
        # Extrai nome limpo do paciente (remove o ID do exame)
        # Formato: NOME_PACIENTE_697001cf
        parts = patient_name.rsplit('_', 1)
        if len(parts) == 2 and len(parts[1]) == 8:
            clean_name = parts[0].replace('_', ' ')
            exam_id = parts[1]
        else:
            clean_name = patient_name.replace('_', ' ')
            exam_id = 'unknown'
        
        # Lista imagens na pasta
        images = [f for f in patient_folder.iterdir() if f.is_file() and f.suffix.lower() in ['.jpg', '.jpeg', '.png']]
        
        if not images:
            continue
        
        print(f"👤 {clean_name} ({len(images)} imagens)")
        
        # Tenta pegar os detalhes do paciente do estado do downloader
        downloader_state_path = Path("download_state.json")
        clinic_name = "Phelcom EyeR Cloud"
        patient_metadata = {}
        if downloader_state_path.exists():
            try:
                with open(downloader_state_path, 'r', encoding='utf-8') as f:
                    d_state = json.load(f)
                    exam_id_full = patient_folder.name.split('_')[-1]
                    for eid, details in d_state.get('exam_details', {}).items():
                        # Matching mais flexível: prefixo, sufixo ou contido
                        if exam_id in eid or eid in exam_id:
                            clinic_name = details.get('clinic_name', clinic_name)
                            patient_metadata = {
                                'birthday': details.get('birthday'),
                                'gender': details.get('gender'),
                                'cpf': details.get('cpf'),
                                'underlying_diseases': details.get('underlying_diseases'),
                                'ophthalmic_diseases': details.get('ophthalmic_diseases'),
                                'otherDisease': details.get('otherDisease')
                            }
                            break
            except Exception as e:
                print(f"   ⚠️ Erro ao ler metadados do paciente: {e}")

        # Inicializa mapeamento do paciente
        if patient_name not in state['patient_mapping']:
            state['patient_mapping'][patient_name] = {
                'images': [],
                'bytescale_folder': f'/neuroapp/patients/{sanitize_folder_name(patient_name)}'
            }
        
        # Always update metadata
        state['patient_mapping'][patient_name].update({
            'patient_name': clean_name,
            'exam_id': exam_id,
            'clinic_name': clinic_name,
            **patient_metadata
        })
        
        patient_data = state['patient_mapping'][patient_name]
        bytescale_folder = patient_data['bytescale_folder']
        
        for image in images:
            total_images += 1
            image_path = str(image.absolute())
            
            # Metadata cross-reference for filtering
            image_uuid = image.stem
            is_color = True # Default to COLOR if metadata is missing to avoid empty results
            found_metadata = False
            
            if downloader_state_path.exists():
                try:
                    with open(downloader_state_path, 'r', encoding='utf-8') as f:
                        d_state = json.load(f)
                        
                        # Find the correct exam and then the image type
                        for details in d_state.get('exam_details', {}).values():
                            # Folder name must be an EXACT match to avoid partial ID overlapping
                            if details.get('folder_name') == patient_folder.name:
                                img_list = details.get('image_list', [])
                                if img_list:
                                    found_metadata = True
                                    is_color = False # Reset default
                                    for img_data in img_list:
                                        if img_data['uuid'] == image_uuid:
                                            if img_data.get('type') == 'COLOR':
                                                is_color = True
                                            break
                                break
                except Exception:
                    pass
            
            # Critical fallback: if we DID NOT find metadata by exact folder name,
            # try finding by the exam_id suffix as a backup, but only if it's the 8-char hex
            if not found_metadata and len(exam_id) == 8:
                try:
                    with open(downloader_state_path, 'r', encoding='utf-8') as f:
                        d_state = json.load(f)
                        for eid, details in d_state.get('exam_details', {}).items():
                            if eid == exam_id or eid.endswith(exam_id):
                                img_list = details.get('image_list', [])
                                if img_list:
                                    found_metadata = True
                                    is_color = False
                                    for img_data in img_list:
                                        if img_data['uuid'] == image_uuid:
                                            if img_data.get('type') == 'COLOR':
                                                is_color = True
                                            break
                                break
                except Exception:
                    pass

            # If we explicitly found metadata and it's NOT color, skip it
            if not is_color:
                total_skipped += 1
                continue

            # Verifica se já foi uploaded
            if image_path in state['uploaded_files']:
                total_skipped += 1
                continue
            
            if args.dry_run:
                print(f"   📤 [SIMULADO] {image.name}")
                total_uploaded += 1
                continue
            
            # Faz upload
            result = upload_file(image, bytescale_folder, image.name)
            
            if result:
                print(f"   ✅ {image.name}")
                state['uploaded_files'].append(image_path)
                
                # Adiciona ao mapeamento
                patient_data['images'].append({
                    'filename': image.name,
                    'local_path': image_path,
                    'bytescale_path': result.get('filePath'),
                    'bytescale_url': result.get('fileUrl'),
                    'upload_date': datetime.now().isoformat()
                })
                
                total_uploaded += 1
                save_state(state)
            else:
                total_errors += 1
        
        print()
    
    # Salva mapeamento final
    if not args.dry_run:
        save_mapping(state)
    
    # Resumo
    print("=" * 60)
    print("📊 RESUMO")
    print("=" * 60)
    print(f"   Total de imagens: {total_images}")
    print(f"   ✅ Uploaded: {total_uploaded}")
    print(f"   ⏭️ Já existiam: {total_skipped}")
    print(f"   ❌ Erros: {total_errors}")
    print("=" * 60)
    
    if not args.dry_run:
        print(f"\n📄 Mapeamento salvo em: {MAPPING_FILE.absolute()}")
        print("   Use este arquivo para integrar com o app NeuroApp")


if __name__ == "__main__":
    main()
