"""
06_compare_metrics.py — Compara métricas AutoMorph (nosso) vs CSV do médico (Mozania).

Lê o CSV do médico (dataset_mozania_v2_with_automorph.csv) e o Macular_Features.csv
gerado pelo nosso AutoMorph, faz o match por UUID da imagem, e gera:
- Tabela de concordância (Pearson r, ICC, Bland-Altman)
- Scatter plots de comparação para cada métrica
- Resumo de discrepâncias

Uso:
    python 06_compare_metrics.py \
        --medico "C:\Users\jvict\Downloads\dataset_mozania_v2_with_automorph.csv" \
        --nosso  "automorph_results_mozania\Macular_Features.csv"
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import argparse
import os
import re
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
FIGURES_DIR = SCRIPT_DIR / 'figures_comparison'

# Mapping: CSV do médico (6 métricas por olho) -> AutoMorph column names
# O CSV do médico tem: {side}_{metric} onde side = left/right
# O AutoMorph Macular_Features tem: {Metric} (global, sem side)
# Como cada imagem é de um olho específico, comparamos diretamente.
METRIC_MAP = {
    'Fractal_dimension': 'Fractal_dimension',
    'Vessel_density': 'Vessel_density',
    'Average_width': 'Average_width',
    'Distance_tortuosity': 'Distance_tortuosity',
    'Squared_curvature_tortuosity': 'Squared_curvature_tortuosity',
    'Tortuosity_density': 'Tortuosity_density',
}


def extract_uuid_from_filename(name):
    """Extract UUID from AutoMorph output filename.

    Input filenames: NOME_PACIENTE_OD_uuid.jpg (or .png after AutoMorph)
    The UUID is always the last part before the extension, 36 chars with hyphens.
    """
    # Remove extension
    stem = os.path.splitext(str(name))[0]
    # UUID pattern: 8-4-4-4-12 hex
    uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    matches = re.findall(uuid_pattern, stem, re.IGNORECASE)
    if matches:
        return matches[-1]  # last match = the UUID
    return None


def load_medico_data(csv_path):
    """Load doctor's CSV and reshape to one row per image (UUID + metrics)."""
    df = pd.read_csv(csv_path, encoding='utf-8-sig')

    rows = []
    for _, row in df.iterrows():
        patient_name = row.get('NOME', '')
        patient_id = row.get('Eyercloud Patient.id', '')

        # Left eye (OE)
        if pd.notna(row.get('image_left')):
            r = {
                'uuid': row['image_left'],
                'patient_name': patient_name,
                'patient_id': patient_id,
                'eye': 'OE',
                'centred_on': row.get('left_centred_on', ''),
                'source': 'medico',
            }
            for metric in METRIC_MAP:
                col = f'left_{metric}'
                r[f'medico_{metric}'] = row.get(col, np.nan)
            rows.append(r)

        # Right eye (OD)
        if pd.notna(row.get('image_right')):
            r = {
                'uuid': row['image_right'],
                'patient_name': patient_name,
                'patient_id': patient_id,
                'eye': 'OD',
                'centred_on': row.get('right_centred_on', ''),
                'source': 'medico',
            }
            for metric in METRIC_MAP:
                col = f'right_{metric}'
                r[f'medico_{metric}'] = row.get(col, np.nan)
            rows.append(r)

    return pd.DataFrame(rows)


def load_nosso_data(csv_path):
    """Load our AutoMorph Macular_Features.csv and extract UUID from filename."""
    df = pd.read_csv(csv_path)

    # Detect image name column
    name_col = None
    for c in df.columns:
        if any(kw in c.lower() for kw in ['name', 'image', 'file']):
            name_col = c
            break
    if not name_col:
        name_col = df.columns[0]

    df['uuid'] = df[name_col].apply(extract_uuid_from_filename)

    # Rename metric columns
    rename = {}
    for metric in METRIC_MAP:
        am_col = METRIC_MAP[metric]
        if am_col in df.columns:
            rename[am_col] = f'nosso_{metric}'
    df = df.rename(columns=rename)

    return df


def compute_icc(y1, y2):
    """Compute ICC(3,1) — two-way mixed, single measures, consistency."""
    n = len(y1)
    if n < 3:
        return np.nan, np.nan

    # Combine into matrix
    data = np.column_stack([y1, y2])
    k = 2  # number of raters

    # Means
    row_mean = data.mean(axis=1)
    grand_mean = data.mean()

    # Sum of squares
    ss_rows = k * np.sum((row_mean - grand_mean) ** 2)
    ss_cols = n * np.sum((data.mean(axis=0) - grand_mean) ** 2)
    ss_total = np.sum((data - grand_mean) ** 2)
    ss_error = ss_total - ss_rows - ss_cols

    # Mean squares
    ms_rows = ss_rows / (n - 1)
    ms_error = ss_error / ((n - 1) * (k - 1))

    # ICC(3,1)
    icc = (ms_rows - ms_error) / (ms_rows + (k - 1) * ms_error)

    return icc


def analyze_comparison(merged, metric):
    """Compute comparison stats for one metric."""
    col_med = f'medico_{metric}'
    col_nos = f'nosso_{metric}'

    valid = merged[[col_med, col_nos]].dropna()
    if len(valid) < 5:
        return None

    y_med = valid[col_med].values
    y_nos = valid[col_nos].values

    # Pearson correlation
    r, p = stats.pearsonr(y_med, y_nos)

    # ICC
    icc = compute_icc(y_med, y_nos)

    # Bland-Altman
    diff = y_nos - y_med
    mean_diff = diff.mean()
    std_diff = diff.std()
    loa_lower = mean_diff - 1.96 * std_diff
    loa_upper = mean_diff + 1.96 * std_diff

    # Mean absolute error
    mae = np.abs(diff).mean()

    # Relative error (%)
    mean_val = (np.abs(y_med) + np.abs(y_nos)).mean() / 2
    rel_error = (mae / mean_val * 100) if mean_val > 0 else np.nan

    return {
        'metric': metric,
        'N': len(valid),
        'pearson_r': r,
        'p_value': p,
        'ICC': icc,
        'mean_diff': mean_diff,
        'std_diff': std_diff,
        'LOA_lower': loa_lower,
        'LOA_upper': loa_upper,
        'MAE': mae,
        'rel_error_pct': rel_error,
        'mean_medico': y_med.mean(),
        'mean_nosso': y_nos.mean(),
    }


def plot_scatter(merged, metric, result, filename):
    """Scatter plot: médico vs nosso, com linha de identidade."""
    col_med = f'medico_{metric}'
    col_nos = f'nosso_{metric}'

    valid = merged[[col_med, col_nos]].dropna()
    y_med = valid[col_med].values
    y_nos = valid[col_nos].values

    fig, axes = plt.subplots(1, 2, figsize=(14, 6))

    # Scatter plot
    ax = axes[0]
    ax.scatter(y_med, y_nos, alpha=0.3, s=10, color='steelblue')

    # Identity line
    lims = [min(y_med.min(), y_nos.min()), max(y_med.max(), y_nos.max())]
    margin = (lims[1] - lims[0]) * 0.05
    lims = [lims[0] - margin, lims[1] + margin]
    ax.plot(lims, lims, '--', color='red', linewidth=1, label='Identidade (y=x)')

    # Regression line
    z = np.polyfit(y_med, y_nos, 1)
    p = np.poly1d(z)
    ax.plot(sorted(y_med), p(sorted(y_med)), '-', color='gray', linewidth=1, alpha=0.7, label=f'Regressão')

    ax.set_xlabel('Médico (CSV)', fontsize=12)
    ax.set_ylabel('Nosso (AutoMorph)', fontsize=12)
    ax.set_title(f'{metric}\nr={result["pearson_r"]:.4f}, ICC={result["ICC"]:.4f}', fontsize=13, fontweight='bold')
    ax.legend(fontsize=9)

    # Bland-Altman
    ax = axes[1]
    means = (y_med + y_nos) / 2
    diffs = y_nos - y_med
    ax.scatter(means, diffs, alpha=0.3, s=10, color='steelblue')
    ax.axhline(result['mean_diff'], color='red', linestyle='-', linewidth=1, label=f'Viés: {result["mean_diff"]:.4f}')
    ax.axhline(result['LOA_upper'], color='gray', linestyle='--', linewidth=1, label=f'LOA: [{result["LOA_lower"]:.4f}, {result["LOA_upper"]:.4f}]')
    ax.axhline(result['LOA_lower'], color='gray', linestyle='--', linewidth=1)
    ax.set_xlabel('Média (Médico + Nosso) / 2', fontsize=12)
    ax.set_ylabel('Diferença (Nosso − Médico)', fontsize=12)
    ax.set_title(f'Bland-Altman: {metric}', fontsize=13, fontweight='bold')
    ax.legend(fontsize=9)

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / filename, dpi=150, bbox_inches='tight')
    plt.close()


def main():
    parser = argparse.ArgumentParser(description='Compara métricas AutoMorph: nosso vs médico')
    parser.add_argument('--medico', required=True, help='CSV do médico (dataset_mozania_v2_with_automorph.csv)')
    parser.add_argument('--nosso', required=True, help='Nosso Macular_Features.csv do AutoMorph')
    args = parser.parse_args()

    print("=" * 80)
    print("  COMPARAÇÃO DE MÉTRICAS: Nosso AutoMorph vs CSV do Médico")
    print("=" * 80)

    # Load data
    print(f"\nCarregando CSV do médico: {args.medico}")
    df_med = load_medico_data(args.medico)
    print(f"  {len(df_med)} imagens (com UUID + métricas)")

    print(f"\nCarregando nosso AutoMorph: {args.nosso}")
    df_nos = load_nosso_data(args.nosso)
    print(f"  {len(df_nos)} imagens processadas")
    uuids_nos = set(df_nos['uuid'].dropna())
    print(f"  {len(uuids_nos)} UUIDs extraídos")

    # Merge by UUID
    merged = df_med.merge(df_nos, on='uuid', how='inner')
    print(f"\nMatch por UUID: {len(merged)} imagens em comum")

    if len(merged) == 0:
        print("\n⚠ Nenhum match! Verificando UUIDs...")
        print(f"  Médico UUIDs (exemplos): {list(df_med['uuid'].head(3))}")
        print(f"  Nosso UUIDs (exemplos): {list(df_nos['uuid'].dropna().head(3))}")
        return

    # Create figures dir
    FIGURES_DIR.mkdir(exist_ok=True)

    # Analyze each metric
    print("\n" + "=" * 80)
    print("  CONCORDÂNCIA POR MÉTRICA")
    print("=" * 80)

    results = []
    for metric in METRIC_MAP:
        result = analyze_comparison(merged, metric)
        if result:
            results.append(result)

            # Interpretação do ICC
            icc = result['ICC']
            if icc >= 0.9:
                icc_label = "Excelente"
            elif icc >= 0.75:
                icc_label = "Bom"
            elif icc >= 0.5:
                icc_label = "Moderado"
            else:
                icc_label = "Fraco"

            print(f"\n{metric}:")
            print(f"  N={result['N']}")
            print(f"  Pearson r = {result['pearson_r']:.4f} (p = {result['p_value']:.2e})")
            print(f"  ICC(3,1) = {icc:.4f} — {icc_label}")
            print(f"  Viés médio = {result['mean_diff']:.6f}")
            print(f"  MAE = {result['MAE']:.6f} ({result['rel_error_pct']:.1f}%)")
            print(f"  LOA = [{result['LOA_lower']:.6f}, {result['LOA_upper']:.6f}]")
            print(f"  Média médico: {result['mean_medico']:.6f}, Média nosso: {result['mean_nosso']:.6f}")

            # Plot
            safe_name = metric.lower().replace(' ', '_')
            plot_scatter(merged, metric, result, f'compare_{safe_name}.png')
            print(f"  Gráfico: figures_comparison/compare_{safe_name}.png")

    # Summary table
    if results:
        print("\n" + "=" * 80)
        print("  RESUMO")
        print("=" * 80)

        summary = pd.DataFrame(results)
        print(f"\n{'Métrica':<35} {'N':>5} {'Pearson r':>10} {'ICC':>8} {'MAE':>10} {'Erro%':>7}")
        print("-" * 80)
        for _, row in summary.iterrows():
            print(f"{row['metric']:<35} {row['N']:>5} {row['pearson_r']:>10.4f} {row['ICC']:>8.4f} {row['MAE']:>10.6f} {row['rel_error_pct']:>6.1f}%")

        # Overall assessment
        mean_icc = summary['ICC'].mean()
        mean_r = summary['pearson_r'].mean()
        print(f"\n--- Avaliação Global ---")
        print(f"ICC médio: {mean_icc:.4f}")
        print(f"Pearson r médio: {mean_r:.4f}")

        if mean_icc >= 0.9:
            print("✅ Concordância EXCELENTE — os dois pipelines produzem resultados praticamente idênticos")
        elif mean_icc >= 0.75:
            print("✅ Concordância BOA — diferenças pequenas, resultados confiáveis")
        elif mean_icc >= 0.5:
            print("⚠ Concordância MODERADA — verificar diferenças nos parâmetros do AutoMorph")
        else:
            print("❌ Concordância FRACA — pipelines provavelmente usam configurações diferentes")

        # Save summary CSV
        summary_path = SCRIPT_DIR / 'metrics_comparison_summary.csv'
        summary.to_csv(summary_path, index=False, encoding='utf-8-sig')
        print(f"\nTabela salva: {summary_path}")

        # Save merged dataset
        merged_path = SCRIPT_DIR / 'metrics_comparison_full.csv'
        merged.to_csv(merged_path, index=False, encoding='utf-8-sig')
        print(f"Dataset completo: {merged_path}")


if __name__ == '__main__':
    main()
