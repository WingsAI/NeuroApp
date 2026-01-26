import os
import asyncio
import json
import time
from datetime import date
from urllib.parse import urlparse
import aiofiles
import pandas as pd
from playwright.async_api import async_playwright
from tqdm.asyncio import tqdm
from dotenv import load_dotenv

# Load configuration
load_dotenv()

EYERCLOUD_USUARIO = os.getenv('EYERCLOUD_USUARIO')
EYERCLOUD_SENHA = os.getenv('EYERCLOUD_SENHA')
EYERCLOUD_DOMAIN = os.getenv('EYERCLOUD_DOMAIN', 'https://eyercloud.com')
DOWNLOAD_DIR = os.getenv('PASTA_DADOS', 'downloads')
STATE_FILE = "download_state.json"

HEADERS_BASE = {
    'Accept': 'application/json, text/plain, */*',
}

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    return {"downloaded_exams": []}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=4)

async def login(page):
    print(f'Attempting login at {EYERCLOUD_DOMAIN}')
    await page.goto(f"{EYERCLOUD_DOMAIN}/login")
    await page.get_by_placeholder("Email").fill(EYERCLOUD_USUARIO)
    await page.get_by_placeholder("Senha").fill(EYERCLOUD_SENHA)
    await page.get_by_placeholder("Senha").press("Enter")
    await page.wait_for_url("**/exam", timeout=60000)
    print('Login successful.')
    return page.request

async def get_clinics(request):
    response = await request.post(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/clinic/list")
    data = await response.json()
    return data.get('result', [])

async def set_clinic(request, clinic_id):
    await request.post(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/clinic/change", data={"id": clinic_id})

async def fetch_exams(request, page_num=1):
    payload = {
        "startDate": "01/01/2000",
        "endDate": "01/01/2050",
        "statusFilter": "all",
        "page": str(page_num)
    }
    response = await request.fetch(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/exam/filter", method="post", data=payload)
    return await response.json()

async def fetch_exam_details(request, exam_id):
    response = await request.get(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/examData/list", params={"id": exam_id})
    return await response.json()

async def get_cloudfront_base(page):
    # Wait for a thumbnail to appear to ensure data is loaded
    try:
        await page.wait_for_selector("a.thumbnail-box", timeout=10000)
        href = await page.eval_on_selector(
            "a.thumbnail-box[href*='cloudfront.net']",
            "e => e.href"
        )
        parsed = urlparse(href)
        return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        # Fallback to a known CloudFront URL if detection fails
        return "https://d25chn8x2vrs37.cloudfront.net"

async def download_image(request, url, filepath, referrer):
    if os.path.exists(filepath):
        return False
    
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    response = await request.get(url, headers={"Referer": referrer})
    
    if response.status == 200:
        content = await response.body()
        async with aiofiles.open(filepath, mode='wb') as f:
            await f.write(content)
        return True
    return False

async def process_exam(request, exam, cloudfront_base, state, referrer, clinic_name):
    exam_id = exam['id']
    
    patient_data = exam.get('patient', {})
    patient_name = (patient_data.get('fullName') or exam.get('patientFullName') or exam.get('patientName') or 'Unknown_Patient').replace(' ', '_').replace('/', '-')
    
    # Store clinic name and other details - ALWAYS DO THIS to ensure metadata is captured
    if 'exam_details' not in state:
        state['exam_details'] = {}
        
    # Get image list if missing or if we need it
    image_list = []
    if exam_id not in state.get('downloaded_exams', []) or 'image_list' not in state['exam_details'].get(exam_id, {}):
        details = await fetch_exam_details(request, exam_id)
        image_list = details.get('examDataList', [])
    else:
        image_list = state['exam_details'][exam_id].get('image_list', [])

    anamnesis = patient_data.get('anamnesis') or {}
    
    state['exam_details'][exam_id] = {
        "patient_name": patient_data.get('fullName') or exam.get('patientFullName'),
        "clinic_name": clinic_name,
        "birthday": patient_data.get('birthday'),
        "gender": patient_data.get('gender'),
        "cpf": patient_data.get('document2'), # API uses document2 for CPF
        "underlying_diseases": {
            "diabetes": anamnesis.get('diabetes', patient_data.get('diabetes', False)),
            "hypertension": anamnesis.get('hypertension', patient_data.get('hypertension', False)),
            "cholesterol": anamnesis.get('cholesterol', patient_data.get('cholesterol', False)),
            "smoker": anamnesis.get('smoker', patient_data.get('smoker', False))
        },
        "ophthalmic_diseases": {
            "diabeticRetinopathy": anamnesis.get('diabeticRetinopathy', patient_data.get('diabeticRetinopathy', False)),
            "dmri": anamnesis.get('dmri', patient_data.get('dmri', False)),
            "glaucoma": anamnesis.get('glaucoma', patient_data.get('glaucoma', False)),
            "cataract": anamnesis.get('cataract', patient_data.get('cataract', False)),
            "pterygium": anamnesis.get('pterygium', patient_data.get('pterygium', False)),
            "lowVisualAcuity": anamnesis.get('lowVisualAcuity', patient_data.get('lowVisualAcuity', False))
        },
        "otherDisease": patient_data.get('otherDisease') or anamnesis.get('otherDisease'),
        "folder_name": f"{patient_name}_{exam_id}",
        "download_date": state['exam_details'].get(exam_id, {}).get('download_date') or date.today().isoformat(),
        "image_list": image_list # Store images with types for later filtering
    }
    
    if exam_id in state['downloaded_exams'] and image_list:
        # If already downloaded but we just updated metadata, we can return
        # unless some images are actually missing from disk?
        # For safety, let's just return if it was already marked as downloaded.
        return 0
    
    if not image_list:
        if exam_id not in state['downloaded_exams']:
            state['downloaded_exams'].append(exam_id)
        return 0

    exam_folder = os.path.join(DOWNLOAD_DIR, f"{patient_name}_{exam_id}")
    downloaded_count = 0
    
    for img_data in image_list:
        uuid = img_data['uuid']
        img_url = f"{cloudfront_base}/{uuid}"
        filepath = os.path.join(exam_folder, f"{uuid}.jpg")
        
        if await download_image(request, img_url, filepath, referrer):
            downloaded_count += 1
            
    state['downloaded_exams'].append(exam_id)
    return downloaded_count

async def main():
    if not EYERCLOUD_USUARIO or not EYERCLOUD_SENHA:
        print("ERROR: Please set EYERCLOUD_USUARIO and EYERCLOUD_SENHA in .env file.")
        return

    state = load_state()
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(locale='pt-BR')
        page = await context.new_page()
        
        request = await login(page)
        clinics = await get_clinics(request)
        
        print(f"Found {len(clinics)} clinic(s).")
        
        cloudfront_base = await get_cloudfront_base(page)
        print(f"Detected Image Base URL: {cloudfront_base}")
        
        total_images = 0
        
        for clinic in clinics:
            clinic_id = clinic['id']
            clinic_name = clinic['name']
            print(f"\nProcessing Clinic: {clinic_name}")
            await set_clinic(request, clinic_id)
            
            page_num = 1
            all_seen_ids = set()
            
            while True:
                data = await fetch_exams(request, page_num)
                exams = data.get('result', [])
                if not exams:
                    break
                
                # Double check pagination
                current_page_ids = {e['id'] for e in exams}
                if current_page_ids.issubset(all_seen_ids):
                    break
                all_seen_ids.update(current_page_ids)
                
                print(f"  Processing page {page_num} ({len(exams)} exams)...")
                
                # Using tqdm for progress tracking
                tasks = [process_exam(request, exam, cloudfront_base, state, page.url, clinic_name) for exam in exams]
                results = await tqdm.gather(*tasks, desc=f"    Downloading {clinic_name}", leave=False)
                
                total_images += sum(results)
                save_state(state) # Save frequently
                
                page_num += 1
                await asyncio.sleep(0.5) # Modest throttle

        await browser.close()
        print(f"\nFinished! Total new images downloaded: {total_images}")

if __name__ == "__main__":
    asyncio.run(main())
