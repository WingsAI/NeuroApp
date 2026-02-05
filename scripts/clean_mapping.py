import json
from pathlib import Path

def main():
    mapping_path = Path("e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_final.json")
    with open(mapping_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Identificar entradas curtas vs completas
    short_keys = [k for k in data.keys() if len(k.split('_')[-1]) <= 8]
    long_keys = [k for k in data.keys() if len(k.split('_')[-1]) > 8]
    
    print(f"Total keys: {len(data)}")
    print(f"Short IDs (<= 8 chars): {len(short_keys)}")
    print(f"Long IDs (> 8 chars): {len(long_keys)}")
    
    # Verificar se as short keys são subconjuntos das long keys (baseadas no nome)
    cleaned_mapping = {}
    
    # Primeiro, pegamos todos os registros longos (que tendem a ser mais completos)
    for k in long_keys:
        cleaned_mapping[k] = data[k]
        
    # Depois, verificamos as curtas
    added_short = 0
    discarded_short = 0
    
    # Criar um índice de nomes para busca rápida
    names_in_cleaned = {v.get('patient_name', '').upper(): k for k, v in cleaned_mapping.items()}
    
    for k in short_keys:
        name = data[k].get('patient_name', '').upper()
        if name in names_in_cleaned:
            # Já temos um registro longo para esse nome, descartamos o curto pois é duplicado/errado
            discarded_short += 1
        else:
            # Não temos registro longo, vamos manter o curto (pode ser um paciente legítimo que só tem ID curto)
            cleaned_mapping[k] = data[k]
            added_short += 1
            
    print(f"Discarded short duplicates: {discarded_short}")
    print(f"Kept unique short entries: {added_short}")
    print(f"Final clean count: {len(cleaned_mapping)}")

    # Salvar novo arquivo
    target_path = Path("e:/GitHub/NeuroApp/scripts/eyercloud_downloader/bytescale_mapping_cleaned.json")
    with open(target_path, 'w', encoding='utf-8') as f:
        json.dump(cleaned_mapping, f, indent=2, ensure_ascii=False)
        
    print(f"Saved cleaned mapping to {target_path}")

if __name__ == "__main__":
    main()
