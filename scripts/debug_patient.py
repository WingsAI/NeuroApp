import asyncio
import os
import json
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
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()
        page = await context.new_page()
        
        user = os.getenv('EYERCLOUD_USUARIO')
        password = os.getenv('EYERCLOUD_SENHA')
        
        await page.goto("https://eyercloud.com/login")
        await page.fill('input[placeholder="Email"]', user)
        await page.fill('input[placeholder="Senha"]', password)
        await page.click('button:has-text("Entrar")')
        await page.wait_for_url("**/exam")
        
        request_context = context.request
        
        # Test Adriana
        exam_id = "69809d981fa8062e17d3add7"
        exam_resp = await fetch_exam_details(request_context, exam_id)
        p_id = exam_resp.get('exam', {}).get('patient')
        print(f"Patient ID: {p_id}")
        
        p_info = await fetch_patient_details(request_context, p_id)
        print("Patient Info:")
        print(json.dumps(p_info, indent=2))
        
        await browser.close()

asyncio.run(main())
