#!/usr/bin/env python3
"""
Download images specifically for APARECIDO ROBERTO LOCAISE
Exam ID: 69809d9f51ffa0242a2cdddb
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

EXAM_ID = '69809d9f51ffa0242a2cdddb'
PATIENT_NAME = 'APARECIDO ROBERTO LOCAISE'
BASE_URL = 'https://eyercloud.com'
AUTH_STATE_FILE = Path('auth_state.json')
DOWNLOADS_DIR = Path('downloads')

async def download_aparecido():
    print(f'=== Downloading images for {PATIENT_NAME} ===')
    print(f'Exam ID: {EXAM_ID}\n')

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)

        if AUTH_STATE_FILE.exists():
            context = await browser.new_context(storage_state=str(AUTH_STATE_FILE))
            print('Using saved auth session')
        else:
            context = await browser.new_context()
            print('No saved session - will need to login')

        page = await context.new_page()

        # Open EyerCloud
        print('Opening EyerCloud...')
        await page.goto(BASE_URL, timeout=60000)

        print('\n' + '=' * 60)
        print('  FACA LOGIN NO NAVEGADOR (se necessário)')
        print('  Aguardando 15 segundos...')
        print('=' * 60 + '\n')

        await asyncio.sleep(15)

        # Save session
        await context.storage_state(path=str(AUTH_STATE_FILE))
        print('Session saved!\n')

        # Navigate to exam page
        print(f'Navigating to exam {EXAM_ID}...')
        await page.goto(f'{BASE_URL}/exams', timeout=60000)
        await asyncio.sleep(2)

        # Fetch exam data using API
        print('Fetching exam data from API...')
        result = await page.evaluate(f"""
            async () => {{
                const resp = await fetch('{BASE_URL}/api/v2/eyercloud/examData/list?id={EXAM_ID}', {{
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
            print(f'❌ Error fetching exam data: HTTP {result["error"]}')
            await browser.close()
            return

        # Extract images
        exam_data = result.get('result', [])
        if not exam_data or len(exam_data) == 0:
            print('❌ No exam data found')
            await browser.close()
            return

        exam = exam_data[0]
        images_data = exam.get('images', {})

        # Collect all images (COLOR and ANTERIOR only, skip REDFREE)
        all_images = []
        for img_type in ['COLOR', 'ANTERIOR']:
            if img_type in images_data:
                type_images = images_data[img_type]
                if isinstance(type_images, list):
                    for img in type_images:
                        img['image_type'] = img_type
                        all_images.append(img)

        print(f'\nFound {len(all_images)} images (COLOR + ANTERIOR)')

        if len(all_images) == 0:
            print('❌ No images to download')
            await browser.close()
            return

        # Create download folder
        folder_name = f'{PATIENT_NAME.replace(" ", "_")}_{EXAM_ID[:8]}'
        download_folder = DOWNLOADS_DIR / folder_name
        download_folder.mkdir(parents=True, exist_ok=True)

        print(f'Download folder: {download_folder}\n')

        # Download each image
        downloaded = []
        for idx, img_data in enumerate(all_images):
            img_type = img_data.get('image_type', 'UNKNOWN')
            img_uuid = img_data.get('uuid', f'unknown_{idx}')
            img_url = img_data.get('thumbnailImageURL', img_data.get('imageURL'))

            if not img_url:
                print(f'  ⚠ Image {idx + 1}: No URL found')
                continue

            # Full URL
            if not img_url.startswith('http'):
                img_url = f'{BASE_URL}{img_url}'

            filename = f'{img_type}_{idx + 1}_{img_uuid[:8]}.jpg'
            filepath = download_folder / filename

            print(f'  Downloading {idx + 1}/{len(all_images)}: {img_type} -> {filename}')

            try:
                # Download using page context
                response = await page.request.get(img_url)
                if response.status == 200:
                    content = await response.body()
                    filepath.write_bytes(content)
                    print(f'    ✓ Saved ({len(content)} bytes)')
                    downloaded.append({
                        'type': img_type,
                        'uuid': img_uuid,
                        'filename': filename,
                        'url': img_url
                    })
                else:
                    print(f'    ❌ HTTP {response.status}')
            except Exception as e:
                print(f'    ❌ Error: {e}')

        await browser.close()

        print(f'\n=== Download Summary ===')
        print(f'Total images found: {len(all_images)}')
        print(f'Successfully downloaded: {len(downloaded)}')
        print(f'Folder: {download_folder}')

        # Save metadata
        metadata = {
            'exam_id': EXAM_ID,
            'patient_name': PATIENT_NAME,
            'images': downloaded
        }

        metadata_file = download_folder / 'metadata.json'
        metadata_file.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding='utf-8')
        print(f'\nMetadata saved to {metadata_file}')

        print('\n✓ Download complete!')
        print('\nNext step: Upload to Bytescale using bytescale_uploader.py')

if __name__ == '__main__':
    asyncio.run(download_aparecido())
