"""
Análise Completa — master_proteomics.csv
Estudo: Retina APOE — Proteômica Lagrimal, Imagem Retiniana e Cognição em DM2
Alvo: rMMSE_soma

Seções:
    1. Análise Descritiva
    2. Insights / Correlações
    3. Modelo Preditivo (Elastic Net, Random Forest, XGBoost)
"""

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

# ── Configurações ────────────────────────────────────────────────────────────
DATA_PATH = Path(__file__).parent / "master_proteomics.csv"
TARGET = "rMMSE_soma"
SEED = 42
np.random.seed(SEED)

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 1 — ANÁLISE DESCRITIVA
# ─────────────────────────────────────────────────────────────────────────────

print("=" * 70)
print("SEÇÃO 1 — ANÁLISE DESCRITIVA")
print("=" * 70)

df = pd.read_csv(DATA_PATH)

print(f"\nShape: {df.shape[0]} linhas x {df.shape[1]} colunas")
print(f"Dtypes: {df.dtypes.value_counts().to_dict()}")

# Missings
missing = df.isnull().sum()
missing_pct = (missing / len(df) * 100).round(2)
missing_df = pd.DataFrame({"missing_n": missing, "missing_pct": missing_pct})
missing_df = missing_df[missing_df.missing_n > 0].sort_values("missing_pct", ascending=False)
print(f"\n--- Variáveis com valores ausentes ({len(missing_df)} de {df.shape[1]}) ---")
print(missing_df.to_string())

# Variável alvo
print(f"\n--- Variável Alvo: {TARGET} ---")
print(df[TARGET].describe())
print(f"\nDistribuição de frequências:")
print(df[TARGET].value_counts().sort_index())

# Variáveis clínicas contínuas
clinical_cont = [
    "IDADE", "Escolaridade (ANOS)", "Tempo DM (ANOS)", "IMC",
    "PAS", "PAD", "HbA1C", "GLICEMIA", "LDL", "HDL",
    "CKD-EP", "MICROALB", "RISCO_PREVENT_10Y"
]
clinical_cont = [c for c in clinical_cont if c in df.columns]
print(f"\n--- Variáveis Clínicas Contínuas ---")
print(df[clinical_cont].describe().round(2).to_string())

# Variáveis binárias
binary_vars = ["DC", "HAS", "DISLIPIDEMIA", "ESTATINA", "INFARTO", "AVC", "DVA"]
binary_vars = [c for c in binary_vars if c in df.columns]
print(f"\n--- Variáveis Binárias ---")
for v in binary_vars:
    counts = df[v].value_counts()
    pcts = (counts / len(df) * 100).round(1)
    print(f"  {v}: {dict(zip(counts.index, [f'{c} ({p}%)' for c, p in zip(counts.values, pcts.values)]))}")

# Variáveis categóricas
cat_vars = ["sexo", "NAC.1", "Score Framin", "RISCO_PREVENT_CAT"]
print(f"\n--- Variáveis Categóricas ---")
for v in cat_vars:
    if v in df.columns:
        print(f"\n  {v}:")
        print(df[v].value_counts().to_string(header=False))

# Proteínas
protein_cols = [
    "SERPINA3", "BCHE", "SERPINA6", "C2", "KNG1", "ALB", "SERPINA4", "CFI",
    "CFB", "C1RL", "SERPINA1", "ITIH4", "SERPINC1", "ORM1", "C1R", "HPX",
    "SERPINF2", "ECM1", "F12", "CFD", "HRG", "ORM2", "AMBP", "LDHB", "MST1",
    "TF", "SERPING1", "AGT", "VASN", "SERPINF1", "PLG", "A1BG", "CPB2", "CTBS",
    "FETUB", "PGLYRP2", "GC", "SHBG", "CA1", "SERPINA7", "SERPINA5", "VNN1",
    "KLKB1", "GGH", "HGFAC", "ITIH1", "ITIH2", "C7", "AZGP1", "CFHR2",
    "IGFBP3", "FCN3", "SSC5D", "C8B", "VTN", "APOA4", "FN1", "BTD", "IGFALS",
    "C9", "RBP4", "F13B", "QSOX1", "FCGR3A", "ANG", "APOL1", "FGB", "C8G",
    "FGG", "C8A", "IGHV323", "IGLV310", "PIGR", "LYVE1", "IGHV169", "TFRC",
    "C1QA", "IGLV319", "DCD", "PRG4", "PZP", "IGLV325", "A2M", "IGLV949",
    "IGLC3", "ATRN", "C5", "CFP", "C1QB", "C1QC", "IGLV211", "IGLV469", "DPP4"
]
protein_cols = [c for c in protein_cols if c in df.columns]
print(f"\n--- Proteômica: {len(protein_cols)} proteínas ---")
print(df[protein_cols].describe().round(3).loc[["mean", "std", "min", "max"]].to_string())

# Retinal AVG
retinal_avg = [c for c in df.columns if c.startswith("AVG_")]
print(f"\n--- Imagem Retiniana AVG ({len(retinal_avg)} variáveis) ---")
if retinal_avg:
    print(df[retinal_avg].describe().round(4).loc[["count", "mean", "std", "min", "max"]].to_string())

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 2 — CORRELAÇÕES E INSIGHTS
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("SEÇÃO 2 — CORRELAÇÕES COM rMMSE_soma")
print("=" * 70)

# Correlações gerais (excluindo redundantes MMSE-related)
redundant = [
    "erro", "erro.1", "erro.2", "MMSE_SOMA", "MMSE_SOMA.1", "MMSE_SOMA.2",
    "MME-1", "MME-2", "MME-3", "MME-4", "MME-4 a", "MME-4 b",
    "MME-5", "MME-6", "MME-7", "MME-8", "MME-9", "MME-10", "MME-11",
    "1.5DP(<)", "1.5DP", "1,5DP(≤)", "CIND(<)", "CIND(≤)",
    "DC", "aliquotas", TARGET
]
numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
candidate_cols = [c for c in numeric_cols if c not in redundant]

corr_series = df[candidate_cols + [TARGET]].corr()[TARGET].drop(TARGET)
corr_series = corr_series.dropna().sort_values(key=abs, ascending=False)

print(f"\nTop 30 correlações com {TARGET} (excluindo redundantes):")
print(corr_series.head(30).round(4).to_string())

print(f"\n--- Top 10 Proteínas (correlação com {TARGET}) ---")
prot_corr = corr_series[corr_series.index.isin(protein_cols)].head(10)
print(prot_corr.round(4).to_string())

print(f"\n--- Top 10 Retinais AVG (correlação com {TARGET}) ---")
ret_corr = corr_series[corr_series.index.isin(retinal_avg)].head(10)
print(ret_corr.round(4).to_string())

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 3 — MODELO PREDITIVO
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("SEÇÃO 3 — MODELO PREDITIVO PARA rMMSE_soma")
print("=" * 70)

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import ElasticNetCV, ElasticNet
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, KFold, cross_validate
from sklearn.inspection import permutation_importance
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

# ── Feature set ──────────────────────────────────────────────────────────────
# Exclui: redundantes MMSE, identificadores, colunas OD/OE (muitos missings)
exclude_cols = set(redundant) | {
    "Unnamed: 0", "DM2", "DN", "DN.1", "nome", "amostra", "#local",
    "SEXO F(FEM)-M(MAS)", "sexo", "NAC", "NAC.1", "Score Framin",
    "RISCO_PREVENT_CAT", "pe risco", "pe risco.1",
    "RD", "RD.1", "RD.2", "RD (P+ NP)", "RD (P)", "maculopatia",
    "RDL-leve", "RDM-mod", "RDG-grave",
    "1.5DP(<)", "1.5DP", "1,5DP(≤)", "CIND(<)", "CIND(≤)",
    "CA ", "T. REGRESSO ANOS", "DEXTRO",
    # remover colunas OD/OE (muitos missings) — usar apenas AVG
}
# Remover OD_ e OE_ (manter AVG_)
ode_cols = [c for c in df.columns if c.startswith("OD_") or c.startswith("OE_")]
exclude_cols.update(ode_cols)

feature_cols = [c for c in numeric_cols if c not in exclude_cols]
print(f"\nFeatures selecionadas: {len(feature_cols)}")

X = df[feature_cols].copy()
y = df[TARGET].copy()

# Remover linhas onde target é nulo
mask = y.notna()
X = X[mask]
y = y[mask]
print(f"N após filtro: {len(X)}")

# ── Seleção por correlação (|r| > 0.10 com alvo) ─────────────────────────────
corr_features = X.corrwith(y).abs().sort_values(ascending=False)
selected_features = corr_features[corr_features > 0.10].index.tolist()
print(f"Features com |r| > 0.10: {len(selected_features)}")
print("Top features:", selected_features[:20])

X_sel = X[selected_features]

# ── Pipeline ─────────────────────────────────────────────────────────────────
preprocess = Pipeline([
    ("imputer", SimpleImputer(strategy="median")),
    ("scaler", StandardScaler()),
])

cv = KFold(n_splits=5, shuffle=True, random_state=SEED)

# ── 1. Elastic Net ────────────────────────────────────────────────────────────
print("\n--- Elastic Net (CV) ---")
enet_pipe = Pipeline([
    ("pre", preprocess),
    ("model", ElasticNetCV(l1_ratio=[0.1, 0.5, 0.7, 0.9, 1.0],
                            alphas=np.logspace(-3, 1, 50),
                            cv=5, max_iter=10000, random_state=SEED))
])
enet_cv = cross_validate(enet_pipe, X_sel, y, cv=cv,
                          scoring=["r2", "neg_mean_absolute_error"],
                          return_train_score=True)
print(f"  R² (test): {enet_cv['test_r2'].mean():.3f} ± {enet_cv['test_r2'].std():.3f}")
print(f"  MAE (test): {-enet_cv['test_neg_mean_absolute_error'].mean():.3f} ± {-enet_cv['test_neg_mean_absolute_error'].std():.3f}")

# Fit final para coeficientes
enet_pipe.fit(X_sel, y)
enet_model = enet_pipe.named_steps["model"]
print(f"  Alpha ótimo: {enet_model.alpha_:.4f} | L1 ratio: {enet_model.l1_ratio_:.2f}")
coef_df = pd.DataFrame({
    "feature": selected_features,
    "coefficient": enet_model.coef_
}).query("coefficient != 0").sort_values("coefficient", key=abs, ascending=False)
print(f"  Coeficientes não-zero: {len(coef_df)}")
print(coef_df.head(20).to_string(index=False))

# ── 2. Random Forest ──────────────────────────────────────────────────────────
print("\n--- Random Forest ---")
rf_pipe = Pipeline([
    ("pre", Pipeline([("imputer", SimpleImputer(strategy="median"))])),
    ("model", RandomForestRegressor(n_estimators=300, max_features="sqrt",
                                     min_samples_leaf=3, random_state=SEED, n_jobs=-1))
])
rf_cv = cross_validate(rf_pipe, X_sel, y, cv=cv,
                        scoring=["r2", "neg_mean_absolute_error"],
                        return_train_score=True)
print(f"  R² (test): {rf_cv['test_r2'].mean():.3f} ± {rf_cv['test_r2'].std():.3f}")
print(f"  MAE (test): {-rf_cv['test_neg_mean_absolute_error'].mean():.3f} ± {-rf_cv['test_neg_mean_absolute_error'].std():.3f}")

rf_pipe.fit(X_sel, y)
rf_model = rf_pipe.named_steps["model"]
rf_imp = pd.DataFrame({
    "feature": selected_features,
    "importance": rf_model.feature_importances_
}).sort_values("importance", ascending=False)
print(f"  Top 20 features por importância (RF):")
print(rf_imp.head(20).to_string(index=False))

# ── 3. Gradient Boosting ──────────────────────────────────────────────────────
print("\n--- Gradient Boosting ---")
gb_pipe = Pipeline([
    ("pre", Pipeline([("imputer", SimpleImputer(strategy="median"))])),
    ("model", GradientBoostingRegressor(n_estimators=200, learning_rate=0.05,
                                         max_depth=3, subsample=0.8,
                                         random_state=SEED))
])
gb_cv = cross_validate(gb_pipe, X_sel, y, cv=cv,
                        scoring=["r2", "neg_mean_absolute_error"],
                        return_train_score=True)
print(f"  R² (test): {gb_cv['test_r2'].mean():.3f} ± {gb_cv['test_r2'].std():.3f}")
print(f"  MAE (test): {-gb_cv['test_neg_mean_absolute_error'].mean():.3f} ± {-gb_cv['test_neg_mean_absolute_error'].std():.3f}")

gb_pipe.fit(X_sel, y)
gb_model = gb_pipe.named_steps["model"]
gb_imp = pd.DataFrame({
    "feature": selected_features,
    "importance": gb_model.feature_importances_
}).sort_values("importance", ascending=False)
print(f"  Top 20 features por importância (GB):")
print(gb_imp.head(20).to_string(index=False))

# ── Comparação de Modelos ─────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("RESUMO — COMPARAÇÃO DE MODELOS")
print("=" * 70)
results = {
    "Elastic Net": {
        "R² médio": enet_cv["test_r2"].mean(),
        "R² std": enet_cv["test_r2"].std(),
        "MAE médio": -enet_cv["test_neg_mean_absolute_error"].mean(),
    },
    "Random Forest": {
        "R² médio": rf_cv["test_r2"].mean(),
        "R² std": rf_cv["test_r2"].std(),
        "MAE médio": -rf_cv["test_neg_mean_absolute_error"].mean(),
    },
    "Gradient Boosting": {
        "R² médio": gb_cv["test_r2"].mean(),
        "R² std": gb_cv["test_r2"].std(),
        "MAE médio": -gb_cv["test_neg_mean_absolute_error"].mean(),
    },
}
results_df = pd.DataFrame(results).T
print(results_df.round(3).to_string())

# ─────────────────────────────────────────────────────────────────────────────
# SEÇÃO 4 — VISUALIZAÇÕES
# ─────────────────────────────────────────────────────────────────────────────

print("\n" + "=" * 70)
print("SEÇÃO 4 — GERANDO FIGURAS")
print("=" * 70)

figures_dir = Path(__file__).parent / "figures"
figures_dir.mkdir(exist_ok=True)

# Fig 1 — Distribuição rMMSE_soma
fig, ax = plt.subplots(figsize=(8, 4))
df[TARGET].hist(bins=20, color="steelblue", edgecolor="white", ax=ax)
ax.axvline(df[TARGET].mean(), color="red", linestyle="--", label=f"Média={df[TARGET].mean():.1f}")
ax.axvline(df[TARGET].median(), color="orange", linestyle="--", label=f"Mediana={df[TARGET].median():.1f}")
ax.set_xlabel("rMMSE_soma")
ax.set_ylabel("Frequência")
ax.set_title("Distribuição do rMMSE_soma")
ax.legend()
plt.tight_layout()
fig.savefig(figures_dir / "fig1_rMMSE_distribuicao.png", dpi=150)
plt.close()
print("  fig1_rMMSE_distribuicao.png salvo")

# Fig 2 — Top correlações com rMMSE (excluindo redundantes)
top_corr = corr_series.head(25)
fig, ax = plt.subplots(figsize=(9, 8))
colors = ["#d73027" if v < 0 else "#4575b4" for v in top_corr.values]
top_corr.sort_values().plot.barh(ax=ax, color=colors)
ax.axvline(0, color="black", linewidth=0.8)
ax.set_title("Top 25 correlações com rMMSE_soma\n(excluindo sub-itens MMSE)")
ax.set_xlabel("Pearson r")
plt.tight_layout()
fig.savefig(figures_dir / "fig2_correlacoes_rMMSE.png", dpi=150)
plt.close()
print("  fig2_correlacoes_rMMSE.png salvo")

# Fig 3 — Importância de features (Random Forest)
fig, ax = plt.subplots(figsize=(9, 8))
rf_imp.head(20).sort_values("importance").plot.barh(
    x="feature", y="importance", ax=ax, color="forestgreen", legend=False
)
ax.set_title("Top 20 Features — Random Forest\n(Importância para rMMSE_soma)")
ax.set_xlabel("Importância")
plt.tight_layout()
fig.savefig(figures_dir / "fig3_rf_feature_importance.png", dpi=150)
plt.close()
print("  fig3_rf_feature_importance.png salvo")

# Fig 4 — Coeficientes Elastic Net
if len(coef_df) > 0:
    fig, ax = plt.subplots(figsize=(9, max(5, len(coef_df) * 0.35)))
    colors_en = ["#d73027" if v < 0 else "#4575b4" for v in coef_df["coefficient"].values]
    ax.barh(coef_df["feature"], coef_df["coefficient"], color=colors_en)
    ax.axvline(0, color="black", linewidth=0.8)
    ax.set_title(f"Coeficientes Elastic Net\n(α={enet_model.alpha_:.4f}, L1={enet_model.l1_ratio_:.2f})")
    ax.set_xlabel("Coeficiente")
    plt.tight_layout()
    fig.savefig(figures_dir / "fig4_elasticnet_coeficientes.png", dpi=150)
    plt.close()
    print("  fig4_elasticnet_coeficientes.png salvo")

# Fig 5 — Predito vs Observado (RF)
from sklearn.model_selection import cross_val_predict
y_pred_rf = cross_val_predict(rf_pipe, X_sel, y, cv=cv)
fig, ax = plt.subplots(figsize=(6, 6))
ax.scatter(y, y_pred_rf, alpha=0.6, color="steelblue", edgecolor="white", s=50)
mn, mx = y.min() - 1, y.max() + 1
ax.plot([mn, mx], [mn, mx], "r--", label="Perfeito")
ax.set_xlabel("rMMSE_soma (observado)")
ax.set_ylabel("rMMSE_soma (predito)")
r2_val = r2_score(y, y_pred_rf)
mae_val = mean_absolute_error(y, y_pred_rf)
ax.set_title(f"Random Forest — Predito vs Observado\nR²={r2_val:.3f} | MAE={mae_val:.2f} (CV-predito)")
ax.legend()
plt.tight_layout()
fig.savefig(figures_dir / "fig5_rf_predito_vs_observado.png", dpi=150)
plt.close()
print("  fig5_rf_predito_vs_observado.png salvo")

# Fig 6 — Bar chart correlações proteínas x rMMSE
top_prots = prot_corr.index.tolist()
if len(top_prots) > 0:
    prot_corr_vals = corr_series[corr_series.index.isin(protein_cols)].sort_values()
    fig, ax = plt.subplots(figsize=(8, 6))
    colors_p = ["#d73027" if v < 0 else "#4575b4" for v in prot_corr_vals.values]
    prot_corr_vals.plot.barh(ax=ax, color=colors_p)
    ax.axvline(0, color="black", linewidth=0.8)
    ax.set_title("Correlação das Proteínas com rMMSE_soma\n(Pearson r)")
    ax.set_xlabel("r")
    plt.tight_layout()
    fig.savefig(figures_dir / "fig6_proteinas_correlacoes.png", dpi=150)
    plt.close()
    print("  fig6_proteinas_correlacoes.png salvo")

print("\n✓ Análise concluída.")
print(f"  Figuras salvas em: {figures_dir}")
