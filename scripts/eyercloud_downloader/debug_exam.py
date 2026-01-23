import json
import os
import asyncio
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv()

EYERCLOUD_USUARIO = os.getenv('EYERCLOUD_USUARIO')
EYERCLOUD_SENHA = os.getenv('EYERCLOUD_SENHA')
EYERCLOUD_DOMAIN = os.getenv('EYERCLOUD_DOMAIN', 'https://eyercloud.com')

async def check():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        
        print(f'Logging in to {EYERCLOUD_DOMAIN}...')
        await page.goto(f"{EYERCLOUD_DOMAIN}/login")
        await page.get_by_placeholder("Email").fill(EYERCLOUD_USUARIO)
        await page.get_by_placeholder("Senha").fill(EYERCLOUD_SENHA)
        await page.get_by_placeholder("Senha").press("Enter")
        await page.wait_for_url("**/exam")
        
        exam_id = '6970067426260539c16a97a8'
        print(f'Fetching data for exam {exam_id}...')
        resp = await page.request.get(f"{EYERCLOUD_DOMAIN}/api/v2/eyercloud/examData/list", params={'id': exam_id})
        data = await resp.json()
        
        with open('debug_exam_data.json', 'w') as f:
            json.dump(data, f, indent=2)
        
        print(f'Saved debug_exam_data.json. Found {len(data.get("examDataList", []))} items in examDataList.')
        
        await browser.close()

if __name__ == "__main__":
    asyncio.run(check())
