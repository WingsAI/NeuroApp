import asyncio
import json
import os
from playwright.async_api import async_playwright

BASE_URL = "https://ec2.eyercloud.com"
AUTH_FILE = "auth_state.json"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        if not os.path.exists(AUTH_FILE):
            print("Erro: auth_state.json nao encontrado.")
            return

        context = await browser.new_context(storage_state=AUTH_FILE)
        page = await context.new_page()
        
        print("Acessando EyerCloud...")
        await page.goto(f"{BASE_URL}/exam", wait_until="networkidle")
        await asyncio.sleep(5)
        
        all_exams = {}
        page_num = 1
        
        print("Iniciando coleta de IDs via DOM (Paginacao)...")
        
        while True:
            # Aguarda os boxes de pacientes aparecerem
            try:
                await page.wait_for_selector(".patient-box", timeout=10000)
            except:
                print(f"Aviso: Timeout aguardando pacientes na pagina {page_num}.")
                break
                
            # Extrai IDs e nomes
            current_page_exams = await page.evaluate('''() => {
                const results = [];
                document.querySelectorAll('.patient-box').forEach(box => {
                    const id = box.getAttribute('data-exam-id');
                    const nameEl = box.querySelector('a.btn-secondary span');
                    const name = nameEl ? nameEl.innerText.trim() : 'Desconhecido';
                    if (id) results.push({ id, name });
                });
                return results;
            }''')
            
            new_ids = 0
            for e in current_page_exams:
                eid = e['id']
                if eid not in all_exams:
                    all_exams[eid] = { "name": e['name'], "page": page_num }
                    new_ids += 1
            
            print(f"Pagina {page_num}: Coletados {len(current_page_exams)} exames ({new_ids} novos). Total: {len(all_exams)}")
            
            # Tenta ir para a proxima pagina
            # O botao de proximo no EyerCloud geralmente eh um link com icone de seta ou numero
            # Vamos tentar clicar no botao "Proximo" (btn-next ou similar)
            next_button = await page.query_selector("li.next:not(.disabled) a")
            if not next_button:
                # Tenta por texto se nao achar classe
                next_button = await page.query_selector("text='Próximo'")
                if not next_button:
                    next_button = await page.query_selector("a[aria-label='Next']")
            
            if next_button and new_ids > 0:
                await next_button.click()
                await asyncio.sleep(3) # Espera carregar
                page_num += 1
            else:
                print("Fim da paginacao (botao Proximo ausente ou desativado).")
                break
                
            if page_num > 50: break
            
        print(f"\nConcluido! Total de exames encontrados: {len(all_exams)}")
        
        with open("eyercloud_active_ids.json", "w", encoding="utf-8") as f:
            json.dump(all_exams, f, indent=2, ensure_ascii=False)
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
