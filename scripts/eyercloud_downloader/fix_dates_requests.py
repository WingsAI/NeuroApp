import json
import requests
import time
from pathlib import Path

STATE_FILE = Path("scripts/eyercloud_downloader/download_state.json")
API_LOGIN = "https://eyercloud.com/api/v2/eyercloud/auth/login"
API_DETAILS = "https://eyercloud.com/api/v2/eyercloud/examData/list"

# Credentials from .env
EMAIL = "dryurehermerson1@gmail.com"
PASSWORD = "@Eyercloud1"

def main():
    if not STATE_FILE.exists():
        print("State file not found.")
        return

    with open(STATE_FILE, 'r', encoding='utf-8') as f:
        state = json.load(f)

    session = requests.Session()
    print("Logging in...")
    login_resp = session.post(API_LOGIN, json={"email": EMAIL, "password": PASSWORD})
    
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.status_code} - {login_resp.text}")
        return
    
    print("Login successful!")

    exam_details = state.get('exam_details', {})
    ids_to_fix = [eid for eid, details in exam_details.items() if 'exam_date' not in details or details['exam_date'] is None]
    
    print(f"Found {len(ids_to_fix)} exams to fix.")
    
    count = 0
    for exam_id in ids_to_fix:
        try:
            resp = session.get(f"{API_DETAILS}?id={exam_id}")
            if resp.status_code == 200:
                data = resp.json()
                if 'exam' in data:
                    exam_date = data['exam'].get('date')
                    state['exam_details'][exam_id]['exam_date'] = exam_date
                    count += 1
                    print(f"✅ Fixed {exam_id}: {exam_date}")
            else:
                print(f"❌ Error {resp.status_code} for {exam_id}")
            
            if count % 20 == 0 and count > 0:
                print(f"Progress: {count}/{len(ids_to_fix)}...")
                with open(STATE_FILE, 'w', encoding='utf-8') as f:
                    json.dump(state, f, indent=4, ensure_ascii=False)
            
            time.sleep(0.2) # Avoid rate limiting
        except Exception as e:
            print(f"Exception for {exam_id}: {e}")

    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, indent=4, ensure_ascii=False)
        
    print(f"Done! Fixed {count} exams.")

if __name__ == "__main__":
    main()
