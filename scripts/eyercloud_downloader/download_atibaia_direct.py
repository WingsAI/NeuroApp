#!/usr/bin/env python3
"""
Direct CDN downloader for Atibaia using UUIDs from staging_state.

The /examData/list endpoint is unreliable for recent exams. This script bypasses
it: for each exam, read UUIDs from staging_state_prevavcatibaia.json and download
directly from the EyerCloud CloudFront CDN.

Usage:  python download_atibaia_direct.py
"""
import asyncio
import json
import re
import sys
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("pip install playwright"); sys.exit(1)
import requests

EMAIL = "prevavcatibaia@gmail.com"
PASSWORD = "inct.Atibaia1"
BASE_URL = "https://ec2.eyercloud.com"
CDN_BASE = "https://d25chn8x2vrs37.cloudfront.net"
STAGING_FILE = Path("staging_state_prevavcatibaia.json")
AUTH_FILE = Path("auth_state_prevavcatibaia.json")
OUT_DIR = Path("downloads_staging/prevavcatibaia")


def safe_folder(name, exam_id):
    safe = re.sub(r'[<>:"/\\|?*]', '_', name).replace(' ', '_')
    return f"{safe}_{exam_id[:8]}"


async def get_cookies():
    """Re-login to refresh cookies."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(storage_state=str(AUTH_FILE)) if AUTH_FILE.exists() else await browser.new_context()
        page = await ctx.new_page()
        await page.goto(BASE_URL, timeout=60000)
        await asyncio.sleep(2)
        if '/exam' not in page.url:
            print("Re-logging in...")
            await page.get_by_placeholder("Email").fill(EMAIL)
            pw = page.get_by_placeholder("Senha")
            await pw.fill(PASSWORD)
            await pw.press("Enter")
            await page.wait_for_url("**/exam**", timeout=15000)
        await ctx.storage_state(path=str(AUTH_FILE))
        cookies = {c['name']: c['value'] for c in await ctx.cookies()}
        await browser.close()
    return cookies


def main():
    state = json.loads(STAGING_FILE.read_text(encoding='utf-8'))
    exams = state.get('exams', {})
    exam_images = state.get('exam_images', {})

    # Build download queue
    queue = []
    for eid, imgs in exam_images.items():
        ex = exams.get(eid, {})
        name = ex.get('patientName', 'Unknown')
        folder = OUT_DIR / safe_folder(name, eid)
        for img in imgs:
            t = (img.get('type') or '').upper()
            if t not in ('COLOR', 'ANTERIOR'):
                continue
            uuid = img.get('uuid')
            if not uuid:
                continue
            filepath = folder / f"{uuid}.jpg"
            queue.append({'uuid': uuid, 'type': t, 'path': filepath, 'exam_id': eid, 'patient': name})

    print(f"Queue: {len(queue)} images")
    cookies = asyncio.run(get_cookies())
    headers = {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://ec2.eyercloud.com/',
    }

    ok = skip = fail = 0
    for i, item in enumerate(queue, 1):
        p = item['path']
        if p.exists() and p.stat().st_size > 1000:
            skip += 1
            continue
        p.parent.mkdir(parents=True, exist_ok=True)
        url = f"{CDN_BASE}/{item['uuid']}"
        try:
            r = requests.get(url, cookies=cookies, headers=headers, timeout=60)
            if r.status_code == 200 and len(r.content) > 1000:
                p.write_bytes(r.content)
                ok += 1
                if i % 10 == 0:
                    print(f"  [{i}/{len(queue)}] ok={ok} skip={skip} fail={fail}")
            else:
                print(f"  FAIL {item['uuid'][:8]}.. status={r.status_code} ({item['patient']})")
                fail += 1
        except Exception as e:
            print(f"  EX {item['uuid'][:8]}.. {e}")
            fail += 1

    print(f"\nDone: ok={ok}, skip={skip}, fail={fail}, total={len(queue)}")


if __name__ == '__main__':
    main()
