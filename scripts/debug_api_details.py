import asyncio
import os
import json
from playwright.async_api import async_playwright
from dotenv import load_dotenv

load_dotenv('scripts/eyercloud_downloader/.env')

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
        
        exam_id = "69809d981fa8062e17d3add7" # Adriana
        url = f"https://eyercloud.com/api/v2/eyercloud/examData/list?id={exam_id}"
        response = await context.request.get(url)
        data = await response.json()
        
        print("API Response Structure:")
        print(json.dumps(data, indent=2))
        
        await browser.close()

asyncio.run(main())
