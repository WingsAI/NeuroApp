import json
with open('download_state.json', 'r', encoding='utf-8') as f:
    d = json.load(f)
exam = d.get('exam_details', {}).get('697001c526260539c16a9606')
if exam:
    img_list = exam.get('image_list', [])
    print(f"Total: {len(img_list)}")
    print(f"Color: {len([i for i in img_list if i.get('type') == 'COLOR'])}")
    print(f"Redfree: {len([i for i in img_list if i.get('type') == 'REDFREE'])}")
else:
    print("Exam not found")
