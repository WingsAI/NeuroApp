import asyncio
import json
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright

STATE_FILE = Path("scripts/eyercloud_downloader/download_state.json")
AUTH_STATE_FILE = Path("scripts/eyercloud_downloader/auth_state.json")

async def fetch_exam_details(page, exam_id):
    """Busca os detalhes de um exame específico."""
    result = await page.evaluate('''async (examId) => {
        const response = await fetch(`https://eyercloud.com/api/v2/eyercloud/examData/list?id=${examId}`, {
            method: "GET",
            headers: { "Accept": "application/json" },
            credentials: "include"
        });
        const text = await response.text();
        try { return JSON.parse(text); } catch (e) { return null; }
    }''', exam_id)
    return result

async def main():
    if not STATE_FILE.exists():
        print("State file not found.")
        return

    with open(STATE_FILE, 'r', encoding='utf-8') as f:
        state = json.load(f)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
        else:
            print("Auth state not found. Please log in first.")
            return
            
        page = await context.new_page()
        await page.goto("https://ec2.eyercloud.com/exam")
        await asyncio.sleep(2)

        exam_details = state.get('exam_details', {})
        ids_to_fix = [eid for eid, details in exam_details.items() if 'exam_date' not in details or details['exam_date'] is None]
        
        print(f"Found {len(ids_to_fix)} exams to fix metadata.")
        
        count = 0
        for exam_id in ids_to_fix:
            try:
                details = await fetch_exam_details(page, exam_id)
                if details:
                    if 'exam' in details:
                        exam_date = details['exam'].get('date')
                        state['exam_details'][exam_id]['exam_date'] = exam_date
                        count += 1
                        print(f"✅ Fixed {exam_id}: {exam_date}")
                    else:
                        print(f"⚠️ Exam not found in details for {exam_id}")
                else:
                    print(f"❌ Failed to fetch details for {exam_id}")
                
                if count % 10 == 0 and count > 0:
                    print(f"Progress: {count}/{len(ids_to_fix)}...")
                    with open(STATE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(state, f, indent=4, ensure_ascii=False)
            except Exception as e:
                print(f"Error fixing {exam_id}: {e}")
        
        with open(STATE_FILE, 'w', encoding='utf-8') as f:
            json.dump(state, f, indent=4, ensure_ascii=False)
            
        print(f"Finished! Fixed {count} exam dates.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
