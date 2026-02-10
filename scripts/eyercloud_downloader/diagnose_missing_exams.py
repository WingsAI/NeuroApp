#!/usr/bin/env python3
"""
Diagnose what's happening with the missing exams
Checks if the API returns data for them
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

MISSING_FILE = Path('../missing_images.json')
BASE_URL = 'https://eyercloud.com'
AUTH_STATE_FILE = Path('auth_state.json')

async def check_exam(page, exam_id, patient_name):
    """Check if exam data exists in API"""
    print(f'\n=== Checking {patient_name} ===')
    print(f'Exam ID: {exam_id}')

    # Fetch exam data
    result = await page.evaluate(f"""
        async () => {{
            try {{
                const resp = await fetch('{BASE_URL}/api/v2/eyercloud/examData/list?id={exam_id}', {{
                    method: 'POST',
                    credentials: 'include',
                    headers: {{'Content-Type': 'application/json'}},
                    body: JSON.stringify({{}})
                }});

                const text = await resp.text();
                console.log('Response status:', resp.status);
                console.log('Response text:', text.substring(0, 200));

                if (!resp.ok) return {{ error: resp.status, text: text }};

                try {{
                    return JSON.parse(text);
                }} catch (e) {{
                    return {{ error: 'parse_error', text: text }};
                }}
            }} catch (e) {{
                return {{ error: 'exception', message: e.toString() }};
            }}
        }}
    """)

    print(f'API Response (full):')
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Try to construct image URLs and test access
    if isinstance(result, dict) and 'examDataList' in result:
        exam_data_list = result.get('examDataList', [])
        data_path = result.get('dataPath', '')
        thumb_path = result.get('thumbDataPath', '')

        print(f'\n=== Testing Image URLs ===')
        print(f'dataPath: {data_path}')
        print(f'thumbDataPath: {thumb_path}')

        for idx, img_data in enumerate(exam_data_list[:2]):  # Test first 2 images
            img_uuid = img_data.get('uuid', '')
            img_id = img_data.get('id', '')
            img_type = img_data.get('type', 'UNKNOWN')

            # Test different URL patterns
            test_urls = [
                f'{data_path}/{img_uuid}',
                f'{thumb_path}?uuid={img_uuid}',
                f'{BASE_URL}/api/v2/eyercloud/examData/image?id={img_id}',
                f'{BASE_URL}/api/v2/eyercloud/examData/thumbnail?id={img_id}',
            ]

            print(f'\nImage {idx + 1} ({img_type}):')
            print(f'  uuid: {img_uuid[:16]}...')
            print(f'  id: {img_id}')

            for url in test_urls:
                try:
                    test_result = await page.evaluate(f"""
                        async () => {{
                            try {{
                                const resp = await fetch('{url}', {{
                                    method: 'GET',
                                    credentials: 'include'
                                }});
                                return {{ status: resp.status, contentType: resp.headers.get('content-type') }};
                            }} catch (e) {{
                                return {{ error: e.toString() }};
                            }}
                        }}
                    """)
                    if 'error' in test_result:
                        print(f'  ❌ {url[:60]}... - {test_result["error"]}')
                    elif test_result['status'] == 200:
                        print(f'  ✓ {url[:60]}... - HTTP {test_result["status"]} ({test_result["contentType"]})')
                    else:
                        print(f'  ❌ {url[:60]}... - HTTP {test_result["status"]}')
                except Exception as e:
                    print(f'  ❌ {url[:60]}... - Exception: {e}')

    return result

async def main():
    if not MISSING_FILE.exists():
        print(f'❌ File not found: {MISSING_FILE}')
        return

    with open(MISSING_FILE, 'r', encoding='utf-8') as f:
        missing = json.load(f)

    print(f'=== Diagnosing {len(missing)} Missing Exams ===\n')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
            print('Using saved auth session')
        else:
            context = await browser.new_context()
            print('No saved session')

        page = await context.new_page()

        # Open EyerCloud
        print('Opening EyerCloud...')
        await page.goto('https://ec2.eyercloud.com', timeout=60000)

        print('\n' + '=' * 60)
        print('  FACA LOGIN NO NAVEGADOR')
        print('  Aguardando 20 segundos...')
        print('=' * 60 + '\n')

        for i in range(20, 0, -1):
            print(f'  Aguardando... {i}s', end='\r')
            await asyncio.sleep(1)
        print('  Continuando...              ')

        # Save session
        await context.storage_state(path=str(AUTH_STATE_FILE))

        # Check each exam
        results = []
        for item in missing:
            result = await check_exam(page, item['examId'], item['patient'])
            results.append({
                'patient': item['patient'],
                'examId': item['examId'],
                'response': result
            })
            await asyncio.sleep(1)

        await browser.close()

        # Summary
        print('\n\n=== Summary ===')
        for r in results:
            print(f"\n{r['patient']} ({r['examId']}):")
            if isinstance(r['response'], dict):
                if 'error' in r['response']:
                    print(f"  ❌ Error: {r['response']['error']}")
                elif 'result' in r['response']:
                    result = r['response']['result']
                    if isinstance(result, list) and len(result) > 0:
                        exam = result[0]
                        images = exam.get('images', {})
                        color_count = len(images.get('COLOR', []))
                        anterior_count = len(images.get('ANTERIOR', []))
                        redfree_count = len(images.get('REDFREE', []))
                        print(f"  ✓ Exam found: COLOR={color_count}, ANTERIOR={anterior_count}, REDFREE={redfree_count}")
                    else:
                        print(f"  ⚠ Empty result")

if __name__ == '__main__':
    asyncio.run(main())
