"""
04_analyze.py — Análise estatística: métricas vasculares x genótipo APOE.

Lê matched_patients.csv + resultados do AutoMorph e gera:
- Tabela descritiva por genótipo
- ANOVA / Kruskal-Wallis
- Teste de tendência linear
- Regressão múltipla (controlando idade, sexo, HAS, DM)
- Gráficos de barras, box plots, correlações

Uso:
    python 04_analyze.py --metrics automorph_results/metrics.csv
    python 04_analyze.py --metrics automorph_results/metrics.csv --img-col "image_name" --fd-col "FractalDimension"
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')

import argparse
import csv
import os
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
MATCHED_CSV = SCRIPT_DIR / 'matched_patients.csv'
MANIFEST_CSV = SCRIPT_DIR / 'image_manifest.csv'
FIGURES_DIR = SCRIPT_DIR / 'figures'

GENOTYPE_ORDER = ['e2e2', 'e2e3', 'e3e3', 'e3e4', 'e4e4']
GENOTYPE_LABELS = {
    'e2e2': 'e2e2\n(Proteção Max)',
    'e2e3': 'e2e3\n(Proteção)',
    'e3e3': 'e3e3\n(Neutro)',
    'e3e4': 'e3e4\n(Risco)',
    'e4e4': 'e4e4\n(Risco Max)',
}
GENOTYPE_COLORS = ['#2166AC', '#92C5DE', '#FFFFBF', '#FDAE61', '#B2182B']

# APOE dose: number of e4 alleles (0, 0, 0, 1, 2) for dose-response
GENOTYPE_DOSE = {'e2e2': -2, 'e2e3': -1, 'e3e3': 0, 'e3e4': 1, 'e4e4': 2}


def load_and_merge(metrics_path, img_col=None):
    """Load all data and merge into single DataFrame."""
    matched = pd.read_csv(MATCHED_CSV, encoding='utf-8-sig')
    manifest = pd.read_csv(MANIFEST_CSV, encoding='utf-8-sig')
    metrics = pd.read_csv(metrics_path)

    # Auto-detect image column in metrics
    if not img_col:
        candidates = [c for c in metrics.columns if any(
            kw in c.lower() for kw in ['image', 'file', 'name', 'img']
        )]
        if candidates:
            img_col = candidates[0]
        else:
            print(f"Colunas disponíveis no metrics: {list(metrics.columns)}")
            print("Use --img-col para especificar a coluna de nome de arquivo")
            return None
    print(f"Coluna de imagem no metrics: {img_col}")

    # Merge manifest + metrics
    merged = manifest.merge(metrics, left_on='image_file', right_on=img_col, how='inner')
    print(f"Imagens com métricas: {len(merged)}")

    # Merge with matched patients for confounders
    merged = merged.merge(
        matched[['name_csv', 'age_apoe', 'sex_apoe', 'has_apoe', 'dm_apoe',
                 'dislipidemia', 'escolaridade', 'cor_raca']],
        left_on='patient_name', right_on='name_csv', how='left'
    )

    # Clean up
    merged['age'] = pd.to_numeric(merged['age_apoe'], errors='coerce')
    merged['sex_binary'] = (merged['sex_apoe'] == 'M').astype(int)
    merged['has_binary'] = (merged['has_apoe'].str.upper() == 'SIM').astype(int)
    merged['dm_binary'] = (merged['dm_apoe'].str.upper() == 'SIM').astype(int)
    merged['apoe_dose'] = merged['genotype'].map(GENOTYPE_DOSE)

    # Filter to known genotypes
    merged = merged[merged['genotype'].isin(GENOTYPE_ORDER)]

    return merged


def detect_metric_columns(df):
    """Auto-detect metric columns from AutoMorph output."""
    metric_keywords = [
        'fractal', 'tortu', 'density', 'width', 'crae', 'crve', 'avr',
        'caliber', 'vessel', 'arteriolar', 'venular'
    ]
    metric_cols = []
    for col in df.columns:
        if any(kw in col.lower() for kw in metric_keywords):
            if pd.api.types.is_numeric_dtype(df[col]):
                metric_cols.append(col)
    return metric_cols


def descriptive_table(df, metric_cols):
    """Generate descriptive statistics table by genotype."""
    print("\n" + "=" * 80)
    print("  TABELA DESCRITIVA POR GENÓTIPO")
    print("=" * 80)

    for col in metric_cols:
        print(f"\n--- {col} ---")
        stats_table = df.groupby('genotype')[col].agg(
            ['count', 'mean', 'std', 'median']
        ).reindex(GENOTYPE_ORDER)
        stats_table['sem'] = stats_table['std'] / np.sqrt(stats_table['count'])
        print(stats_table.to_string())


def test_anova_kw(df, metric_cols):
    """Run ANOVA and Kruskal-Wallis for each metric."""
    print("\n" + "=" * 80)
    print("  ANOVA / KRUSKAL-WALLIS POR GENÓTIPO")
    print("=" * 80)

    results = []
    for col in metric_cols:
        groups = [g[col].dropna().values for _, g in df.groupby('genotype') if len(g[col].dropna()) > 0]
        if len(groups) < 2:
            continue

        # ANOVA
        f_stat, p_anova = stats.f_oneway(*groups)
        # Kruskal-Wallis (non-parametric)
        h_stat, p_kw = stats.kruskal(*groups)

        results.append({
            'metric': col,
            'F_stat': f_stat,
            'p_ANOVA': p_anova,
            'H_stat': h_stat,
            'p_KW': p_kw,
            'sig_005': '*' if p_kw < 0.05 else '',
            'sig_010': '†' if 0.05 <= p_kw < 0.10 else '',
        })
        print(f"\n{col}:")
        print(f"  ANOVA: F={f_stat:.4f}, p={p_anova:.5f}")
        print(f"  Kruskal-Wallis: H={h_stat:.4f}, p={p_kw:.5f}")
        if p_kw < 0.05:
            print(f"  *** SIGNIFICATIVO (p < 0.05)")
        elif p_kw < 0.10:
            print(f"  † Tendência marginal (p < 0.10)")

    return pd.DataFrame(results)


def test_linear_trend(df, metric_cols):
    """Test linear trend: metric vs APOE dose (e2=-2 to e4=+2)."""
    print("\n" + "=" * 80)
    print("  TESTE DE TENDÊNCIA LINEAR (DOSE-RESPOSTA)")
    print("=" * 80)

    results = []
    for col in metric_cols:
        valid = df[['apoe_dose', col]].dropna()
        if len(valid) < 10:
            continue

        r, p = stats.pearsonr(valid['apoe_dose'], valid[col])
        rho, p_spearman = stats.spearmanr(valid['apoe_dose'], valid[col])

        results.append({
            'metric': col,
            'pearson_r': r,
            'p_pearson': p,
            'spearman_rho': rho,
            'p_spearman': p_spearman,
        })
        print(f"\n{col}:")
        print(f"  Pearson r={r:.4f}, p={p:.5f}")
        print(f"  Spearman ρ={rho:.4f}, p={p_spearman:.5f}")
        sig = ""
        if p < 0.05:
            sig = "SIGNIFICATIVO"
        elif p < 0.10:
            sig = "Tendência marginal"
        if sig:
            direction = "↓ diminui" if r < 0 else "↑ aumenta"
            print(f"  {sig}: {direction} com dose de ε4")

    return pd.DataFrame(results)


def regression_analysis(df, metric_cols):
    """Multiple regression controlling for age, sex, HAS, DM."""
    print("\n" + "=" * 80)
    print("  REGRESSÃO MÚLTIPLA (controlando idade, sexo, HAS, DM)")
    print("=" * 80)

    try:
        import statsmodels.api as sm
    except ImportError:
        print("statsmodels não instalado. Instale com: pip install statsmodels")
        return

    results = []
    confounders = ['age', 'sex_binary', 'has_binary', 'dm_binary']

    for col in metric_cols:
        valid = df[['apoe_dose', col] + confounders].dropna()
        if len(valid) < 20:
            continue

        X = valid[['apoe_dose'] + confounders]
        X = sm.add_constant(X)
        y = valid[col]

        try:
            model = sm.OLS(y, X).fit()
            coef = model.params['apoe_dose']
            p_val = model.pvalues['apoe_dose']
            r2 = model.rsquared

            results.append({
                'metric': col,
                'beta_apoe_dose': coef,
                'p_apoe_dose': p_val,
                'R2': r2,
                'N': len(valid),
            })

            print(f"\n{col}:")
            print(f"  β(APOE dose) = {coef:.6f}, p = {p_val:.5f}")
            print(f"  R² = {r2:.4f}, N = {len(valid)}")
            if p_val < 0.05:
                print(f"  *** SIGNIFICATIVO após controle de confundidores")
            elif p_val < 0.10:
                print(f"  † Tendência marginal")
        except Exception as e:
            print(f"\n{col}: Erro na regressão: {e}")

    return pd.DataFrame(results)


def plot_bar_by_genotype(df, col, label, filename):
    """Bar chart by genotype with error bars and trend line (like the reference image)."""
    fig, ax = plt.subplots(figsize=(10, 7))

    means = []
    sems = []
    ns = []
    for g in GENOTYPE_ORDER:
        subset = df[df['genotype'] == g][col].dropna()
        means.append(subset.mean() if len(subset) > 0 else 0)
        sems.append(subset.sem() if len(subset) > 1 else 0)
        ns.append(len(subset))

    x = np.arange(len(GENOTYPE_ORDER))
    bars = ax.bar(x, means, color=GENOTYPE_COLORS, edgecolor='black', linewidth=0.5)
    ax.errorbar(x, means, yerr=sems, fmt='none', ecolor='black', capsize=5, linewidth=1.5)

    # Add value labels on top
    for i, (m, s, n) in enumerate(zip(means, sems, ns)):
        ax.text(i, m + s + (max(means) - min(means)) * 0.02, f'{m:.4f}',
                ha='center', va='bottom', fontweight='bold', fontsize=11)
        ax.text(i, min(means) - (max(means) - min(means)) * 0.08, f'n={n}',
                ha='center', va='top', fontsize=10, color='gray')

    # Trend line
    valid_idx = [i for i in range(len(means)) if ns[i] > 0]
    if len(valid_idx) >= 2:
        x_valid = np.array(valid_idx)
        y_valid = np.array([means[i] for i in valid_idx])
        z = np.polyfit(x_valid, y_valid, 1)
        p = np.poly1d(z)
        ax.plot(x, p(x), '--', color='gray', linewidth=1.5, alpha=0.7)

    # Linear trend stats
    valid = df[['apoe_dose', col]].dropna()
    if len(valid) > 5:
        r, p_val = stats.pearsonr(valid['apoe_dose'], valid[col])
        trend_text = f"Correlação (R): {r:.4f}\nValor-P da Tendência: {p_val:.5f}"
        ax.text(0.02, 0.98, f"--- TESTE DE TENDÊNCIA LINEAR ---\n{trend_text}",
                transform=ax.transAxes, va='top', ha='left', fontsize=9,
                fontfamily='monospace', bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.5))

    labels = [GENOTYPE_LABELS.get(g, g) for g in GENOTYPE_ORDER]
    ax.set_xticks(x)
    ax.set_xticklabels(labels, fontsize=11)
    ax.set_ylabel(label, fontsize=13)
    ax.set_title(f'A Retina sente a "Dose" do Gene APOE?\n{label}', fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / filename, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Salvo: {FIGURES_DIR / filename}")


def plot_boxplot_by_genotype(df, col, label, filename):
    """Box plot with individual points by genotype."""
    fig, ax = plt.subplots(figsize=(10, 7))

    data_by_genotype = []
    for g in GENOTYPE_ORDER:
        subset = df[df['genotype'] == g][col].dropna()
        data_by_genotype.append(subset.values)

    bp = ax.boxplot(data_by_genotype, patch_artist=True, showfliers=True)
    for patch, color in zip(bp['boxes'], GENOTYPE_COLORS):
        patch.set_facecolor(color)
        patch.set_alpha(0.6)

    # Overlay individual points
    for i, (g, data) in enumerate(zip(GENOTYPE_ORDER, data_by_genotype)):
        jitter = np.random.normal(0, 0.05, len(data))
        ax.scatter(np.full_like(data, i + 1) + jitter, data,
                   alpha=0.5, s=20, color='black', zorder=3)

    labels = [GENOTYPE_LABELS.get(g, g) for g in GENOTYPE_ORDER]
    ax.set_xticklabels(labels, fontsize=11)
    ax.set_ylabel(label, fontsize=13)
    ax.set_title(f'{label} por Genótipo APOE', fontsize=14, fontweight='bold')

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / filename, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"  Salvo: {FIGURES_DIR / filename}")


def main():
    parser = argparse.ArgumentParser(description='Análise estatística Retina x APOE')
    parser.add_argument('--metrics', required=True, help='Path to AutoMorph metrics CSV')
    parser.add_argument('--img-col', default=None, help='Column name for image filename in metrics CSV')
    parser.add_argument('--fd-col', default=None, help='Column name for fractal dimension (auto-detected if omitted)')
    args = parser.parse_args()

    print("=" * 80)
    print("  RETINA x APOE — Análise Estatística")
    print("=" * 80)

    # Load and merge
    df = load_and_merge(args.metrics, args.img_col)
    if df is None:
        return

    print(f"\nDataset final: {len(df)} imagens, {df['patient_name'].nunique()} pacientes")
    print(f"Genótipos: {dict(df['genotype'].value_counts())}")

    # Detect metric columns
    metric_cols = detect_metric_columns(df)
    if not metric_cols:
        print("\nNenhuma coluna de métrica detectada automaticamente.")
        print(f"Colunas numéricas disponíveis:")
        for col in df.select_dtypes(include=[np.number]).columns:
            print(f"  {col}")
        return

    print(f"\nMétricas detectadas ({len(metric_cols)}):")
    for col in metric_cols:
        print(f"  {col}")

    # Create figures dir
    FIGURES_DIR.mkdir(exist_ok=True)

    # Run analyses
    descriptive_table(df, metric_cols)
    anova_results = test_anova_kw(df, metric_cols)
    trend_results = test_linear_trend(df, metric_cols)
    regression_results = regression_analysis(df, metric_cols)

    # Generate plots
    print("\n" + "=" * 80)
    print("  GERANDO GRÁFICOS")
    print("=" * 80)

    for col in metric_cols:
        safe_name = col.lower().replace(' ', '_').replace('/', '_')
        label = col.replace('_', ' ').title()
        plot_bar_by_genotype(df, col, label, f'bar_{safe_name}.png')
        plot_boxplot_by_genotype(df, col, label, f'box_{safe_name}.png')

    # Save consolidated results
    output_path = SCRIPT_DIR / 'final_dataset.csv'
    df.to_csv(output_path, index=False, encoding='utf-8-sig')
    print(f"\nDataset consolidado: {output_path}")

    # Summary
    print("\n" + "=" * 80)
    print("  RESUMO")
    print("=" * 80)
    if not anova_results.empty:
        sig = anova_results[anova_results['p_KW'] < 0.05]
        marginal = anova_results[(anova_results['p_KW'] >= 0.05) & (anova_results['p_KW'] < 0.10)]
        print(f"\nMétricas significativas (p < 0.05): {len(sig)}")
        for _, row in sig.iterrows():
            print(f"  {row['metric']}: H={row['H_stat']:.3f}, p={row['p_KW']:.5f}")
        print(f"\nTendências marginais (0.05 ≤ p < 0.10): {len(marginal)}")
        for _, row in marginal.iterrows():
            print(f"  {row['metric']}: H={row['H_stat']:.3f}, p={row['p_KW']:.5f}")

    if not trend_results.empty:
        sig_trend = trend_results[trend_results['p_pearson'] < 0.05]
        print(f"\nTendências lineares significativas: {len(sig_trend)}")
        for _, row in sig_trend.iterrows():
            direction = "↓" if row['pearson_r'] < 0 else "↑"
            print(f"  {row['metric']}: r={row['pearson_r']:.4f}, p={row['p_pearson']:.5f} {direction}")


if __name__ == '__main__':
    main()
