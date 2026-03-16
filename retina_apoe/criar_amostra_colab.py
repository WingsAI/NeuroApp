"""
criar_amostra_colab.py — Cria um ZIP amostral pequeno do mozania_selected_images.zip
para testar o pipeline AutoMorph no Colab sem precisar subir 676 MB.

Extrai N imagens do ZIP original e cria mozania_amostra_colab.zip (~5-15 MB).

Uso:
    python criar_amostra_colab.py           # 20 imagens (default)
    python criar_amostra_colab.py --n 10    # 10 imagens
    python criar_amostra_colab.py --n 50    # 50 imagens
"""

import argparse
import zipfile
from pathlib import Path
import random

SCRIPT_DIR = Path(__file__).parent.resolve()
ZIP_ORIGINAL = SCRIPT_DIR / 'mozania_selected_images.zip'
ZIP_AMOSTRA  = SCRIPT_DIR / 'mozania_amostra_colab.zip'


def criar_amostra(n: int, seed: int = 42):
    if not ZIP_ORIGINAL.exists():
        print(f"ERRO: Não encontrei {ZIP_ORIGINAL}")
        return

    tamanho_mb = ZIP_ORIGINAL.stat().st_size / 1e6
    print(f"ZIP original: {ZIP_ORIGINAL.name} ({tamanho_mb:.0f} MB)")

    with zipfile.ZipFile(ZIP_ORIGINAL, 'r') as zin:
        # Lista só imagens jpg
        todas = [info for info in zin.infolist()
                 if info.filename.lower().endswith('.jpg') and not info.is_dir()]
        total = len(todas)
        print(f"Imagens encontradas no ZIP: {total}")

        if n > total:
            print(f"Aviso: N={n} > total={total}. Usando todas.")
            n = total

        # Seleção aleatória reproduzível
        random.seed(seed)
        selecionadas = random.sample(todas, n)
        selecionadas.sort(key=lambda x: x.filename)

        print(f"Selecionadas: {n} imagens (seed={seed})")
        print("Criando ZIP de amostra...")

        with zipfile.ZipFile(ZIP_AMOSTRA, 'w', zipfile.ZIP_DEFLATED) as zout:
            for i, info in enumerate(selecionadas, 1):
                data = zin.read(info.filename)
                # Garante que vão para a raiz do ZIP (sem subpastas)
                nome = Path(info.filename).name
                zout.writestr(nome, data)
                print(f"  [{i:3d}/{n}] {nome} ({len(data)/1e3:.0f} KB)")

    tamanho_final = ZIP_AMOSTRA.stat().st_size / 1e6
    print(f"\nOK ZIP criado: {ZIP_AMOSTRA.name} ({tamanho_final:.1f} MB)")
    print(f"  {n} imagens de {total} ({n/total*100:.1f}% da amostra original)")
    print(f"\nPróximo passo:")
    print(f"  Suba {ZIP_AMOSTRA.name} no Colab e renomeie para mozania_selected_images.zip")
    print(f"  (ou ajuste o nome na célula de upload do notebook 05_mozania_automorph.ipynb)")


def main():
    parser = argparse.ArgumentParser(description='Cria amostra pequena do ZIP Mozania para Colab')
    parser.add_argument('--n', type=int, default=20, help='Número de imagens na amostra (default: 20)')
    parser.add_argument('--seed', type=int, default=42, help='Semente aleatória (default: 42)')
    args = parser.parse_args()

    criar_amostra(args.n, args.seed)


if __name__ == '__main__':
    main()
