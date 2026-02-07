import asyncio
import json
import os
import re
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = "https://ec2.eyercloud.com"
AUTH_FILE = "auth_state.json"

async def fetch_exams_via_api(page, current_page=1):
    payload = {
        "filter": {
            "startDate": None,
            "endDate": None,
            "patientID": None,
            "patientFullName": None,
            "properties": {
                "mcRas": False, "color": False, "redfree": False,
                "infrared": False, "segAnterior": False,
                "panoramic": False, "stereo": False
            }
        },
        "examCurrentPage": current_page
    }
    
    result = await page.evaluate('''async (payload) => {
        try {
            // Tenta o endpoint principal
            let resp = await fetch("/api/v2/eyercloud/exam/list", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify(payload),
                credentials: "include"
            });
            let data = await resp.json();
            
            if (data.result && data.result.length > 0) return data;
            
            // Fallback para o endpoint simplificado
            resp = await fetch("/api/v2/eyercloud/exam/filter-20-last-with-examdata-and-params", {
                method: "GET",
                headers: { "Accept": "application/json" },
                credentials: "include"
            });
            let text = await resp.text();
            let fallbackData = JSON.parse(text);
            if (Array.isArray(fallbackData)) return { result: fallbackData };
            if (fallbackData.exams) return { result: fallbackData.exams };
            return { result: [] };
        } catch (e) {
            return { error: e.toString(), result: [] };
        }
    }''', payload)
    return result

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        if not os.path.exists(AUTH_FILE):
            print("Erro: auth_state.json nao encontrado.")
            return

        context = await browser.new_context(storage_state=AUTH_FILE)
        page = await context.new_page()
        
        print("Sincronizando IDs ativos...")
        await page.goto(f"{BASE_URL}/exam")
        await asyncio.sleep(2)
        
        all_exams = {}
        page_num = 1
        
        while True:
            print(f"Buscando pagina {page_num}...")
            data = await fetch_exams_via_api(page, page_num)
            
            if "error" in data:
                print(f"Erro na API: {data['error']}")
                break
                
            exams = data.get('result', [])
            if not exams:
                print("Fim dos dados (vazio).")
                break
            
            new_found = 0
            for e in exams:
                eid = e.get('id')
                if eid and eid not in all_exams:
                    all_exams[eid] = {
                        "name": e.get("patientFullName") or e.get("patientName") or e.get("name"),
                        "date": e.get("examDate") or e.get("date") or e.get("updatedAt")
                    }
                    new_found += 1
            
            if new_found == 0:
                print("Nenhum ID novo nesta pagina. Fim da lista.")
                break
                
            page_num += 1
            if page_num > 100: break
                
        print(f"Total de exames ativos encontrados: {len(all_exams)}")
        
        with open("eyercloud_ids_active.json", "w", encoding="utf-8") as f:
            json.dump(all_exams, f, indent=2, ensure_ascii=False)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
