"""
02_prepare_images.py — Prepara imagens locais para input do AutoMorph.

Lê matched_patients.csv, copia imagens do diretório downloads/ para automorph_input/,
e gera resolution_information.csv necessário pelo AutoMorph.

Uso:
    python 02_prepare_images.py              # Preview
    python 02_prepare_images.py --execute    # Copia imagens
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import csv
import os
import shutil
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
MATCHED_CSV = SCRIPT_DIR / 'matched_patients.csv'
OUTPUT_DIR = SCRIPT_DIR / 'automorph_input'
RESULTS_DIR = SCRIPT_DIR / 'automorph_results'

# Phelcom EyerCloud default: ~45° FOV, ~2000x2000 px sensor
# Resolution ≈ 11 μm/pixel (estimated for 45° FOV retinal camera)
DEFAULT_RESOLUTION = 11.0


def main():
    execute = '--execute' in sys.argv

    if not MATCHED_CSV.exists():
        print("ERROR: matched_patients.csv not found. Run 01_match_patients.py --execute first.")
        return

    print("=" * 70)
    print("  RETINA x APOE — Preparação de Imagens para AutoMorph")
    print("=" * 70)
    print()

    with open(MATCHED_CSV, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    images_to_copy = []
    patients_with_images = 0
    skipped_no_file = 0

    for row in rows:
        name = row['name_csv'].replace(' ', '_')
        genotype = row['genotype']
        patient_id = f"{name}_{genotype}"

        for eye, key in [('OD', 'local_od'), ('OE', 'local_oe')]:
            local_path = row.get(key, '').strip()
            if not local_path:
                continue
            if not os.path.exists(local_path):
                skipped_no_file += 1
                continue

            # AutoMorph expects flat directory with images
            # Naming: PatientName_Genotype_Eye.jpg
            out_name = f"{patient_id}_{eye}.jpg"
            images_to_copy.append({
                'src': local_path,
                'dst': OUTPUT_DIR / out_name,
                'patient': row['name_csv'],
                'eye': eye,
                'genotype': genotype,
            })

    # Count unique patients
    unique_patients = set(img['patient'] for img in images_to_copy)
    patients_with_images = len(unique_patients)

    print(f"Pacientes com imagens: {patients_with_images}")
    print(f"Total imagens a copiar: {len(images_to_copy)}")
    print(f"Puladas (arquivo não encontrado): {skipped_no_file}")
    print()

    # Genotype distribution
    from collections import Counter
    genotypes = Counter(img['genotype'] for img in images_to_copy)
    print("Imagens por genótipo:")
    for g in ['e2e2', 'e2e3', 'e2e4', 'e3e3', 'e3e4', 'e4e4']:
        print(f"  {g}: {genotypes.get(g, 0)} imagens")
    print()

    if execute:
        # Create output directories
        OUTPUT_DIR.mkdir(exist_ok=True)
        RESULTS_DIR.mkdir(exist_ok=True)

        # Copy images
        copied = 0
        for img in images_to_copy:
            shutil.copy2(img['src'], img['dst'])
            copied += 1

        print(f"Copiadas {copied} imagens para {OUTPUT_DIR}")

        # Generate resolution_information.csv
        res_path = OUTPUT_DIR / 'resolution_information.csv'
        with open(res_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['imgName', 'pixelSizeInMicrons'])
            for img in images_to_copy:
                writer.writerow([img['dst'].name, DEFAULT_RESOLUTION])

        print(f"Gerado {res_path} ({len(images_to_copy)} entradas, {DEFAULT_RESOLUTION} μm/pixel)")

        # Generate image manifest for later merging with AutoMorph results
        manifest_path = SCRIPT_DIR / 'image_manifest.csv'
        with open(manifest_path, 'w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=[
                'image_file', 'patient_name', 'eye', 'genotype',
            ])
            writer.writeheader()
            for img in images_to_copy:
                writer.writerow({
                    'image_file': img['dst'].name,
                    'patient_name': img['patient'],
                    'eye': img['eye'],
                    'genotype': img['genotype'],
                })

        print(f"Gerado {manifest_path}")
        print()
        print("Próximo passo: Faça upload da pasta automorph_input/ para o Google Colab")
        print("e execute o notebook 03_automorph_colab.ipynb")
    else:
        print("[PREVIEW] Use --execute para copiar imagens")


if __name__ == '__main__':
    main()
