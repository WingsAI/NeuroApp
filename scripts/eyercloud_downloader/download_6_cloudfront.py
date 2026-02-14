"""
Download 6 missing images directly from EyerCloud CloudFront CDN.
No authentication needed - CloudFront URLs are public.
"""

import os
import urllib.request

DOWNLOAD_DIR = os.path.join(os.path.dirname(__file__), "downloads_6_missing")
CDN = "https://d25chn8x2vrs37.cloudfront.net"

MISSING = [
    # MARINEI LULIO RODRIGUES
    {"uuid": "237e9fa8-045a-47e9-a570-d68a5a5c57a7", "type": "COLOR", "lat": "L",
     "patient": "MARINEI_LULIO_RODRIGUES", "exam": "697d03dd565494aed21c07c4"},
    # RITA SIMONE PASTEGA LISBOA
    {"uuid": "ceae2550-01b9-4484-ab71-427f2721659c", "type": "COLOR", "lat": "R",
     "patient": "RITA_SIMONE_PASTEGA_LISBOA", "exam": "697d03df7927d48de9d88c52"},
    {"uuid": "a4df9080-faa8-4892-add7-9ecb38ff763f", "type": "COLOR", "lat": "L",
     "patient": "RITA_SIMONE_PASTEGA_LISBOA", "exam": "697d03df7927d48de9d88c52"},
    # YASMIN GABRIELLA DOS SANTOS FREITAS
    {"uuid": "4f20575b-e5e1-41b6-841b-ec70c26c1d3c", "type": "COLOR", "lat": "L",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam": "697d03e48bc8fc9984f742b0"},
    {"uuid": "176c4245-5afc-451c-9648-cf1217012837", "type": "ANTERIOR", "lat": "R",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam": "697d03e48bc8fc9984f742b0"},
    {"uuid": "b5c09b71-50ad-4a8f-a521-347daf065dc3", "type": "COLOR", "lat": "L",
     "patient": "YASMIN_GABRIELLA_DOS_SANTOS_FREITAS", "exam": "697d03e48bc8fc9984f742b0"},
]

os.makedirs(DOWNLOAD_DIR, exist_ok=True)

for img in MISSING:
    folder = os.path.join(DOWNLOAD_DIR, f"{img['patient']}_{img['exam'][:8]}")
    os.makedirs(folder, exist_ok=True)
    filepath = os.path.join(folder, f"{img['uuid']}.jpg")

    if os.path.exists(filepath):
        sz = os.path.getsize(filepath)
        print(f"Already exists: {img['uuid']}.jpg ({sz} bytes)")
        continue

    url = f"{CDN}/{img['uuid']}"
    print(f"Downloading {img['uuid']} ({img['type']} {img['lat']})...")
    try:
        urllib.request.urlretrieve(url, filepath)
        sz = os.path.getsize(filepath)
        print(f"  Saved: {sz} bytes")
    except Exception as e:
        print(f"  ERROR: {e}")

print("\nDone!")
