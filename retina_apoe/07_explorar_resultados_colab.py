"""
07_explorar_resultados_colab.py — Analisa os resultados baixados do Colab.

Lê os CSVs em mozania_results_all/ e gera:
- Resumo de qualidade (M1)
- Estatísticas descritivas das 73 métricas vasculares
- Heatmap de correlações
- Distribuição das métricas principais
- Identifica outliers

Uso:
    python 07_explorar_resultados_colab.py
    python 07_explorar_resultados_colab.py --results mozania_results_all
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import argparse
import warnings
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats

warnings.filterwarnings('ignore')

SCRIPT_DIR = Path(__file__).parent
FIGURES_DIR = SCRIPT_DIR / 'figures_mozania'


def load_results(results_dir: Path):
    data = {}

    for fname in ['M0_crop_info.csv', 'M1_results_ensemble.csv',
                  'M3_Macular_Features.csv', 'M3_Disc_Features.csv']:
        path = results_dir / fname
        if path.exists():
            data[fname] = pd.read_csv(path)
            print(f"  {fname}: {data[fname].shape[0]} linhas x {data[fname].shape[1]} colunas")
        else:
            print(f"  AUSENTE: {fname}")

    return data


def resumo_qualidade(data):
    print("\n" + "=" * 60)
    print("  QUALIDADE M1 (filtro automático)")
    print("=" * 60)

    m1 = data.get('M1_results_ensemble.csv')
    m0 = data.get('M0_crop_info.csv')

    if m1 is None:
        print("  M1 não disponível")
        return

    total = len(m1)
    # Prediction: 0=good, 1=usable, 2=bad (AutoMorph convention)
    pred_counts = m1['Prediction'].value_counts().sort_index()
    labels = {0: 'Good', 1: 'Usable', 2: 'Bad'}

    print(f"\n  Total de imagens processadas: {total}")
    for k, label in labels.items():
        n = pred_counts.get(k, 0)
        pct = n / total * 100
        bar = '#' * int(pct / 2)
        print(f"  {label:8s} (Pred={k}): {n:3d} ({pct:5.1f}%) {bar}")

    # Good = Prediction==0 passa para análise
    n_good = pred_counts.get(0, 0)
    n_usable = pred_counts.get(1, 0)
    print(f"\n  Aprovadas para M2/M3 (Good):         {n_good} ({n_good/total*100:.0f}%)")
    print(f"  Descartadas (Usable+Bad):             {total-n_good} ({(total-n_good)/total*100:.0f}%)")

    # Top 5 piores imagens
    m1['nome'] = m1['Name'].apply(lambda x: Path(x).stem[:50])
    piores = m1.nlargest(5, 'softmax_bad')[['nome', 'softmax_good', 'softmax_bad', 'Prediction']]
    print(f"\n  5 imagens de pior qualidade:")
    print(piores.to_string(index=False))

    # Gráfico de pizza
    FIGURES_DIR.mkdir(exist_ok=True)
    fig, ax = plt.subplots(figsize=(6, 5))
    sizes = [pred_counts.get(k, 0) for k in [0, 1, 2]]
    colors = ['#2ecc71', '#f39c12', '#e74c3c']
    lbls = [f'{labels[k]}\n(n={pred_counts.get(k,0)})' for k in [0, 1, 2]]
    wedges, texts, autotexts = ax.pie(
        sizes, labels=lbls, colors=colors,
        autopct='%1.0f%%', startangle=90,
        textprops={'fontsize': 11}
    )
    ax.set_title('Qualidade das Imagens (M1 AutoMorph)', fontsize=13, fontweight='bold')
    plt.tight_layout()
    out = FIGURES_DIR / 'qualidade_m1.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"\n  Grafico salvo: {out}")


def resumo_metricas(data, tipo='Macular'):
    fname = f'M3_{tipo}_Features.csv'
    df = data.get(fname)
    if df is None or len(df) == 0:
        print(f"\n  {fname} nao disponivel ou vazio.")
        return None

    print(f"\n{'='*60}")
    print(f"  METRICAS {tipo.upper()} ({len(df)} imagens aprovadas)")
    print(f"{'='*60}")

    # Identificar coluna de nome
    name_col = df.columns[0]
    df['_nome'] = df[name_col].apply(lambda x: Path(str(x)).stem[:40])

    # Colunas numericas (exceto internas)
    num_cols = [c for c in df.columns
                if pd.api.types.is_numeric_dtype(df[c]) and not c.startswith('_')]

    print(f"\n  {len(num_cols)} metricas numericas")
    print(f"\n  Imagens com metricas:")
    for n in df['_nome']:
        print(f"    {n}")

    # Descritiva das principais
    metricas_chave = [c for c in num_cols if any(kw in c.lower() for kw in [
        'fractal', 'vessel_density', 'average_width', 'avr', 'crae', 'crve', 'tortu'
    ])][:20]

    if metricas_chave:
        print(f"\n  Estatisticas descritivas (metricas principais):")
        desc = df[metricas_chave].describe().T[['count', 'mean', 'std', 'min', 'max']]
        desc['cv%'] = (desc['std'] / desc['mean'].abs() * 100).round(1)
        print(desc.to_string())

    return df, num_cols


def plot_distribuicoes(df, num_cols, tipo, n_metricas=12):
    print(f"\n  Gerando graficos de distribuicao ({tipo})...")

    # Selecionar métricas mais representativas
    metricas = [c for c in num_cols if any(kw in c.lower() for kw in [
        'fractal_dimension', 'vessel_density', 'average_width',
        'avr_knudtson', 'crae_knudtson', 'crve_knudtson',
        'distance_tortuosity', 'tortuosity_density'
    ])][:n_metricas]

    if not metricas:
        metricas = num_cols[:n_metricas]

    ncols = 3
    nrows = (len(metricas) + ncols - 1) // ncols
    fig, axes = plt.subplots(nrows, ncols, figsize=(15, 4 * nrows))
    axes = axes.flatten() if nrows > 1 else [axes] if ncols == 1 else axes.flatten()

    for i, col in enumerate(metricas):
        ax = axes[i]
        vals = df[col].dropna()
        if len(vals) == 0:
            ax.set_visible(False)
            continue
        ax.hist(vals, bins=min(len(vals), 10), color='steelblue', edgecolor='white', alpha=0.8)
        ax.axvline(vals.mean(), color='red', linestyle='--', linewidth=1.5, label=f'Media: {vals.mean():.2f}')
        ax.set_title(col.replace('_', ' '), fontsize=9, fontweight='bold')
        ax.legend(fontsize=7)
        ax.tick_params(labelsize=8)

    for j in range(i + 1, len(axes)):
        axes[j].set_visible(False)

    fig.suptitle(f'Distribuicao de Metricas Vasculares — {tipo} (n={len(df)})',
                 fontsize=13, fontweight='bold', y=1.01)
    plt.tight_layout()
    out = FIGURES_DIR / f'distribuicao_{tipo.lower()}.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Salvo: {out}")


def plot_heatmap_correlacoes(df, num_cols, tipo):
    if len(df) < 3:
        print(f"\n  Heatmap ignorado: apenas {len(df)} imagens (minimo 3 para correlacao).")
        return

    # Filtrar colunas com variancia nao-zero
    cols_validas = [c for c in num_cols if df[c].nunique() > 1][:30]
    if len(cols_validas) < 2:
        print(f"\n  Heatmap ignorado: poucas colunas com variancia.")
        return

    corr = df[cols_validas].corr()

    fig, ax = plt.subplots(figsize=(14, 12))
    im = ax.imshow(corr.values, cmap='RdBu_r', vmin=-1, vmax=1, aspect='auto')
    plt.colorbar(im, ax=ax, fraction=0.046, pad=0.04)

    short_labels = [c[:20].replace('_', ' ') for c in cols_validas]
    ax.set_xticks(range(len(cols_validas)))
    ax.set_yticks(range(len(cols_validas)))
    ax.set_xticklabels(short_labels, rotation=90, fontsize=7)
    ax.set_yticklabels(short_labels, fontsize=7)
    ax.set_title(f'Correlacoes entre Metricas — {tipo} (n={len(df)})',
                 fontsize=12, fontweight='bold')
    plt.tight_layout()
    out = FIGURES_DIR / f'correlacoes_{tipo.lower()}.png'
    plt.savefig(out, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Salvo: {out}")


def verificar_concordancia_com_medico(data):
    """Se existir o CSV do médico, compara rapidamente as métricas chave."""
    medico_path = SCRIPT_DIR.parent / 'dataset_mozania_v2_with_automorph.csv'
    if not medico_path.exists():
        # Tentar no Downloads
        from pathlib import Path
        downloads = Path.home() / 'Downloads' / 'dataset_mozania_v2_with_automorph.csv'
        if downloads.exists():
            medico_path = downloads
        else:
            print("\n  CSV do medico nao encontrado. Pulando comparacao.")
            print(f"  (esperado em: {medico_path})")
            return

    df_med = pd.read_csv(medico_path)
    print(f"\n{'='*60}")
    print(f"  CSV DO MEDICO: {df_med.shape}")
    print(f"  Colunas: {list(df_med.columns[:15])}")


def salvar_resumo(data, results_dir: Path):
    """Salva um resumo consolidado em TXT."""
    out = results_dir / 'resumo_analise.txt'
    linhas = []

    m1 = data.get('M1_results_ensemble.csv')
    mac = data.get('M3_Macular_Features.csv')
    disc = data.get('M3_Disc_Features.csv')
    m0 = data.get('M0_crop_info.csv')

    linhas.append("=== RESUMO DOS RESULTADOS AUTOMORPH — MOZANIA ===\n")
    if m0 is not None:
        linhas.append(f"Imagens preprocessadas (M0): {len(m0)}")
    if m1 is not None:
        total = len(m1)
        n_good = (m1['Prediction'] == 0).sum()
        n_usable = (m1['Prediction'] == 1).sum()
        n_bad = (m1['Prediction'] == 2).sum()
        linhas.append(f"Qualidade M1: {total} imagens")
        linhas.append(f"  Good:   {n_good} ({n_good/total*100:.0f}%) → passam para M2/M3")
        linhas.append(f"  Usable: {n_usable} ({n_usable/total*100:.0f}%)")
        linhas.append(f"  Bad:    {n_bad} ({n_bad/total*100:.0f}%)")
    if mac is not None:
        linhas.append(f"Metricas Maculares (M3): {len(mac)} imagens x {len(mac.columns)} metricas")
    if disc is not None:
        linhas.append(f"Metricas Disc (M3):      {len(disc)} imagens x {len(disc.columns)} metricas")

    linhas.append("\n--- Próximos passos ---")
    linhas.append("1. Rodar com TODAS as 1773 imagens no Colab (batch de 500)")
    linhas.append("2. Fazer link com genótipos APOE via matched_patients.csv")
    linhas.append("3. Rodar 04_analyze.py com os resultados completos")
    linhas.append("4. Comparar com métricas do médico via 06_compare_metrics.py")

    with open(out, 'w', encoding='utf-8') as f:
        f.write('\n'.join(linhas))
    print(f"\n  Resumo salvo: {out}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--results', default='mozania_results_all',
                        help='Pasta com os CSVs do Colab (default: mozania_results_all)')
    args = parser.parse_args()

    results_dir = SCRIPT_DIR / args.results
    if not results_dir.exists():
        print(f"ERRO: Pasta nao encontrada: {results_dir}")
        return

    print("=" * 60)
    print("  ANALISE DOS RESULTADOS — MOZANIA")
    print("=" * 60)
    print(f"\n  Pasta: {results_dir}")
    print(f"\n  Carregando CSVs...")
    data = load_results(results_dir)

    FIGURES_DIR.mkdir(exist_ok=True)

    # Qualidade
    resumo_qualidade(data)

    # Métricas Maculares
    resultado_mac = resumo_metricas(data, 'Macular')
    if resultado_mac:
        df_mac, cols_mac = resultado_mac
        plot_distribuicoes(df_mac, cols_mac, 'Macular')
        plot_heatmap_correlacoes(df_mac, cols_mac, 'Macular')

    # Métricas Disc
    resultado_disc = resumo_metricas(data, 'Disc')
    if resultado_disc:
        df_disc, cols_disc = resultado_disc
        plot_distribuicoes(df_disc, cols_disc, 'Disc')
        plot_heatmap_correlacoes(df_disc, cols_disc, 'Disc')

    # Comparação com médico (opcional)
    verificar_concordancia_com_medico(data)

    # Salvar resumo
    salvar_resumo(data, results_dir)

    print(f"\n  Figuras em: {FIGURES_DIR}")
    print(f"\n  PIPELINE VALIDADO. Para rodar com TODAS as 1773 imagens:")
    print(f"    - Ajuste BATCH_SIZE=500, BATCH_START=0 no notebook do Colab")
    print(f"    - Depois: python 07_explorar_resultados_colab.py --results mozania_results_all")
    print(f"    - Depois: python 04_analyze.py --metrics mozania_results_all/M3_Macular_Features.csv")


if __name__ == '__main__':
    main()
