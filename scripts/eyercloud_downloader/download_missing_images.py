#!/usr/bin/env python3
"""
Download images for exams that have metadata but no images downloaded
Reads from ../missing_images.json
Uses requests library with browser cookies (same approach as downloader_playwright.py)
"""
import asyncio
import json
import requests
from pathlib import Path
from playwright.async_api import async_playwright

MISSING_FILE = Path('../missing_images.json')
BASE_URL = 'https://eyercloud.com'
AUTH_STATE_FILE = Path('auth_state.json')
DOWNLOADS_DIR = Path('downloads')

async def download_exam_images(page, context, exam_id, patient_name):
    """Download all images for a single exam"""
    print(f'\n=== {patient_name} ===')
    print(f'Exam ID: {exam_id}')

    # Fetch exam data using API
    print('Fetching exam data...')
    result = await page.evaluate(f"""
        async () => {{
            const resp = await fetch('{BASE_URL}/api/v2/eyercloud/examData/list?id={exam_id}', {{
                method: 'POST',
                credentials: 'include',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify({{}})
            }});
            if (!resp.ok) return {{ error: resp.status }};
            return await resp.json();
        }}
    """)

    if isinstance(result, dict) and 'error' in result:
        print(f'  Error: HTTP {result["error"]}')
        return 0

    # Extract images - NEW API FORMAT
    exam_data_list = result.get('examDataList', [])
    if not exam_data_list or len(exam_data_list) == 0:
        print('  No exam data found')
        return 0

    # Get image CDN path
    data_path = result.get('dataPath', 'https://d25chn8x2vrs37.cloudfront.net')

    # Filter images (COLOR and ANTERIOR only, skip REDFREE)
    all_images = []
    for img_data in exam_data_list:
        img_type = img_data.get('type', 'UNKNOWN')
        if img_type in ['COLOR', 'ANTERIOR']:
            all_images.append(img_data)

    print(f'  Found {len(all_images)} images (filtered COLOR+ANTERIOR)')

    if len(all_images) == 0:
        print('  No images to download')
        return 0

    # Create download folder
    folder_name = f'{patient_name.replace(" ", "_")}_{exam_id[:8]}'
    download_folder = DOWNLOADS_DIR / folder_name
    download_folder.mkdir(parents=True, exist_ok=True)

    # Extract browser cookies for authenticated download
    cookies_list = await context.cookies()
    cookies = {c['name']: c['value'] for c in cookies_list}
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://ec2.eyercloud.com/',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }

    # Download each image using requests (bypasses CORS)
    downloaded = []
    for idx, img_data in enumerate(all_images):
        img_type = img_data.get('type', 'UNKNOWN')
        img_uuid = img_data.get('uuid', f'unknown_{idx}')

        # Construct CloudFront CDN URL
        img_url = f'{data_path}/{img_uuid}'

        filename = f'{img_uuid}.jpg'
        filepath = download_folder / filename

        print(f'  Downloading {idx + 1}/{len(all_images)}: {img_type} ({img_uuid[:8]}...)')

        try:
            resp = requests.get(img_url, cookies=cookies, headers=headers, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 1000:
                filepath.write_bytes(resp.content)
                print(f'    Saved ({len(resp.content)} bytes)')
                downloaded.append({
                    'type': img_type,
                    'uuid': img_uuid,
                    'filename': filename,
                    'url': img_url
                })
            else:
                print(f'    HTTP {resp.status_code} (size: {len(resp.content)} bytes)')
        except Exception as e:
            print(f'    Error: {e}')

    print(f'  Downloaded {len(downloaded)}/{len(all_images)} images')

    # Save metadata
    if len(downloaded) > 0:
        metadata = {
            'exam_id': exam_id,
            'patient_name': patient_name,
            'images': downloaded
        }
        metadata_file = download_folder / 'metadata.json'
        metadata_file.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding='utf-8')

    return len(downloaded)

async def main():
    # Load missing images list
    if not MISSING_FILE.exists():
        print(f'File not found: {MISSING_FILE}')
        print('Run: node scripts/find_missing_images.js first')
        return

    with open(MISSING_FILE, 'r', encoding='utf-8') as f:
        missing = json.load(f)

    print(f'=== Downloading Missing Images ===')
    print(f'Total exams: {len(missing)}\n')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
            print('Using saved auth session')
        else:
            context = await browser.new_context()
            print('No saved session - will need to login')

        page = await context.new_page()

        # Open EyerCloud main page
        print('Opening EyerCloud...')
        await page.goto('https://ec2.eyercloud.com', timeout=60000)

        print('\n' + '=' * 60)
        print('  FACA LOGIN NO NAVEGADOR (se necessario)')
        print('  Aguardando 20 segundos...')
        print('=' * 60 + '\n')

        for i in range(20, 0, -1):
            print(f'  Aguardando... {i}s', end='\r')
            await asyncio.sleep(1)
        print('  Tempo esgotado! Continuando...     ')

        # Save session
        await context.storage_state(path=str(AUTH_STATE_FILE))
        print('\nSession saved!\n')

        # Download images for each exam
        total_downloaded = 0
        for item in missing:
            downloaded = await download_exam_images(
                page,
                context,
                item['examId'],
                item['patient']
            )
            total_downloaded += downloaded
            await asyncio.sleep(1)  # Rate limiting

        await browser.close()

        print(f'\n=== Summary ===')
        print(f'Total exams processed: {len(missing)}')
        print(f'Total images downloaded: {total_downloaded}')
        print(f'\nDownload complete!')
        print('\nNext steps:')
        print('1. python bytescale_uploader.py  (upload to Bytescale)')
        print('2. node ../sync_eyercloud_full.js  (import to database)')

if __name__ == '__main__':
    asyncio.run(main())
