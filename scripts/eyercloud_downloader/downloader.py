import requests
import os
import json
import time

# --- CONFIGURATION ---
# Cole aqui o valor do 'cookie' que você encontrar nas requisições:
COOKIES = "_hjSessionUser_5076341=eyJpZCI6IjZkYzA0OWQwLTYyYmYtNTY3MC04ZDAzLTZkM2FjYzhlNmQ5NCIsImNyZWF0ZWQiOjE3NjkwNTkyMDgxMzUsImV4aXN0aW5nIjp0cnVlfQ==; _hjSession_5076341=eyJpZCI6ImY1Y2FhYWNjLWMzZmItNGVjNS1iMDFmLTZlMDdjMGQ2YTliZiIsImMiOjE3NjkwOTE4NzcxNzMsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=; _auth_verification=s%3AxVwRJ5RfpAQTYn2JeQqWmhcAusWxQXkI.K1cOpTAd87lBRaiqBHvNBMrX0vlSFEbRn5r2tAbWvt0; _hjSessionUser_5196717=eyJpZCI6ImRjOWY5ZWZmLTFkMzYtNThiYi04NDY1LTM1YjcwOGFmYWU0ZiIsImNyZWF0ZWQiOjE3NjkwOTE4ODY3MTEsImV4aXN0aW5nIjp0cnVlfQ==; _hjSession_5196717=eyJpZCI6ImFmY2Y0Y2Q2LWEzMDQtNDBkNC04OWIwLTUzZGNhNTA0NzBhOSIsImMiOjE3NjkwOTE4ODY3MTEsInMiOjEsInIiOjEsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjoxLCJzcCI6MH0=; AWSALBTG=jyVSir3uqOyufYUPkM2szcCaVe/YcJP28ZSufTmZJyVZz7YDlzASzPEGDG1AaO1eHMi3Gh/IxJ31JGfBhD/nX4UkN5iEd/ILfRk+xIZDAda4BFXISoq8e4e7sXJjJ3gAtyJQTGyoqI9rv7hvRXwOorqGMLfII8/kqN0zRmTmJNkjd1CRayI=; AWSALBTGCORS=jyVSir3uqOyufYUPkM2szcCaVe/YcJP28ZSufTmZJyVZz7YDlzASzPEGDG1AaO1eHMi3Gh/IxJ31JGfBhD/nX4UkN5iEd/ILfRk+xIZDAda4BFXISoq8e4e7sXJjJ3gAtyJQTGyoqI9rv7hvRXwOorqGMLfII8/kqN0zRmTmJNkjd1CRayI="

HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Origin': 'https://ec2.eyercloud.com',
    'Referer': 'https://ec2.eyercloud.com/',
}

BASE_API_URL = "https://eyercloud.com/api/v2/eyercloud"
DOWNLOAD_DIR = "downloads"
STATE_FILE = "download_state.json"

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r') as f:
            return json.load(f)
    return {"downloaded_exams": []}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=4)

def fetch_exams(session, page=1):
    url = f"{BASE_API_URL}/exam/list"
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
        "examCurrentPage": page
    }
    response = session.post(url, json=payload, headers=HEADERS)
    response.raise_for_status()
    return response.json()

def fetch_exam_details(session, exam_id):
    url = f"{BASE_API_URL}/examData/list?id={exam_id}"
    response = session.get(url, headers=HEADERS)
    response.raise_for_status()
    return response.json()

def download_image(session, url, filepath):
    if os.path.exists(filepath):
        return False
    
    response = session.get(url, stream=True)
    if response.status_code == 200:
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(1024):
                f.write(chunk)
        return True
    else:
        print(f"    FAILED: status {response.status_code} for {url}")
    return False

def main():
    if not COOKIES or COOKIES == "COLE_AQUI":
        print("ERROR: Please update the COOKIES variable in the script.")
        return

    session = requests.Session()
    # Support for both dict and string format
    if isinstance(COOKIES, dict):
        session.cookies.update(COOKIES)
    else:
        for item in COOKIES.split(';'):
            if '=' in item:
                k, v = item.strip().split('=', 1)
                session.cookies.set(k, v, domain="eyercloud.com")

    state = load_state()
    page = 1
    total_downloaded = 0
    all_seen_ids = set()
    
    print("Starting EyerCloud Image Downloader...")
    
    while True:
        print(f"Fetching page {page}...")
        try:
            data = fetch_exams(session, page)
            exams = data.get('result', [])
            if not exams:
                print("No more exams found.")
                break
            
            # Detect infinite loop (API not respecting pagination)
            current_page_ids = {e['id'] for e in exams}
            if current_page_ids.issubset(all_seen_ids):
                print("Reached end or API does not respect pagination. Stopping.")
                break
            all_seen_ids.update(current_page_ids)

            for exam in exams:
                exam_id = exam['id']
                
                # Check different fields for patient name
                patient_name = exam.get('patientFullName') or exam.get('patientName') or exam.get('name')
                if not patient_name and 'patient' in exam and isinstance(exam['patient'], dict):
                    patient_name = exam['patient'].get('fullName') or exam['patient'].get('name')
                
                if exam_id in state['downloaded_exams']:
                    print(f"Skipping already downloaded: {exam_id}")
                    continue
                
                print(f"Exam: {exam_id}")
                details = fetch_exam_details(session, exam_id)
                
                # Try getting name from details if still missing
                if not patient_name:
                    patient_name = details.get('patientFullName') or details.get('patientName')
                    if not patient_name and 'patient' in details and isinstance(details['patient'], dict):
                        patient_name = details['patient'].get('fullName') or details['patient'].get('name')
                
                patient_name = (patient_name or 'Unknown_Patient').replace(' ', '_').replace('/', '-')
                print(f"  Patient: {patient_name}")

                image_list = details.get('examDataList', [])
                if not image_list:
                    print("    No images found in this exam.")
                
                data_path = details.get('dataPath', 'https://d25chn8x2vrs37.cloudfront.net')
                
                exam_folder = os.path.join(DOWNLOAD_DIR, f"{patient_name}_{exam_id}")
                
                exam_images_downloaded = 0
                for img_data in image_list:
                    uuid = img_data['uuid']
                    img_url = f"{data_path}/{uuid}"
                    img_filename = f"{uuid}.jpg"
                    filepath = os.path.join(exam_folder, img_filename)
                    
                    if download_image(session, img_url, filepath):
                        print(f"    Downloaded: {img_filename}")
                        exam_images_downloaded += 1
                        total_downloaded += 1
                
                if exam_images_downloaded > 0 or not image_list:
                    state['downloaded_exams'].append(exam_id)
                    save_state(state)
                
            page += 1
            time.sleep(1)
            
        except Exception as e:
            print(f"Error: {e}")
            break

    print(f"Finished. Total images: {total_downloaded}")

if __name__ == "__main__":
    main()
