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
        
        # Search for Adriana
        payload = {
            "startDate": "01/01/2000",
            "endDate": "01/01/2050",
            "statusFilter": "all",
            "page": "1",
            "search": "ADRIANA CARVALHO FERNANDES"
        }
        
        response = await context.request.post("https://eyercloud.com/api/v2/eyercloud/exam/filter", data=payload)
        data = await response.json()
        
        print("Search Result:")
        print(json.dumps(data, indent=2))
        
        await browser.close()

asyncio.run(main())
