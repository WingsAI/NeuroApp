import json
from pathlib import Path

def normalize_name(name):
    import unicodedata
    if not name: return "UNKNOWN"
    return "".join(c for c in unicodedata.normalize('NFD', name.upper()) if unicodedata.category(c) != 'Mn')

def main():
    mapping_path = Path("e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_final.json")
    if not mapping_path.exists():
        print("Mapping file not found")
        return

    with open(mapping_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"Total entries (folders) in mapping: {len(data)}")

    unique_patients = {}
    for key, exam in data.items():
        name = exam.get('patient_name', 'Unknown')
        bday = exam.get('birthday', 'Unknown')
        norm_name = normalize_name(name)
        patient_key = f"{norm_name}|{bday}"
        
        if patient_key not in unique_patients:
            unique_patients[patient_key] = []
        unique_patients[patient_key].append(key)

    print(f"Unique patients (Name + Birthday): {len(unique_patients)}")
    
    # Count exams that actually have images
    exams_with_images = [k for k, v in data.items() if len(v.get('images', [])) > 0]
    print(f"Exams with at least one image: {len(exams_with_images)}")

if __name__ == "__main__":
    main()
