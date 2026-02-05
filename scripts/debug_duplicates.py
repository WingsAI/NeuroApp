import json
from pathlib import Path

def main():
    mapping_path = Path("e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_cleaned.json")
    with open(mapping_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    target_names = ["ANA CASSIA FERREIRA FIRMO", "AILA CRISTINA ALVES DE LIMA", "ANTONIA ANTENORA RODRIGUES RAMOS"]
    
    found = []
    for key, exam in data.items():
        name = exam.get('patient_name', '')
        if any(target.upper() in name.upper() for target in target_names):
            found.append({
                "key": key,
                "name": name,
                "cpf": exam.get('cpf'),
                "birthday": exam.get('birthday'),
                "clinic": exam.get('clinic_name'),
                "exam_id": exam.get('exam_id'),
                "image_count": len(exam.get('images', []))
            })

    print(json.dumps(found, indent=2))

if __name__ == "__main__":
    main()
