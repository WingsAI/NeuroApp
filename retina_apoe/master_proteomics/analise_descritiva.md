# Análise Descritiva — master_proteomics.csv

**Data:** 2026-03-12
**Arquivo:** `master_proteomics.csv`
**Tags:** #PhD #Saude #Academia #Negocios

---

## 1. Visão Geral do Dataset

| Métrica | Valor |
|---|---|
| **Linhas (pacientes)** | 120 |
| **Colunas (variáveis)** | 241 |
| **Variável-alvo** | `rMMSE_soma` |
| **Colunas numéricas** | 230 |
| **Colunas categóricas** | 11 |

### Grupos de Variáveis

| Grupo | Qtd. | Descrição |
|---|---|---|
| Proteômica (lagrimal) | 93 | Proteínas normalizadas (log-escala, centradas em 0) |
| Variáveis clínicas contínuas | ~30 | Idade, IMC, HbA1c, LDL, PA, etc. |
| Variáveis clínicas binárias/categóricas | ~20 | Sexo, HAS, DM, RD, DC, etc. |
| Subitens MMSE | 11 | MME-1 a MME-11 |
| Imagem retiniana (AutoMorph) | 54 | OD/OE/AVG × Fractal, Vessel density, Width, Tortuosidade |
| Identificadores / redundantes | ~30 | Nomes, datas, erros, duplicatas |

---

## 2. Variável-Alvo: `rMMSE_soma`

- **Tipo:** Inteiro (escala 0–30)
- **Valores ausentes:** 0 (100% completo)
- **Média:** 25.04 | **Mediana:** 26.5 | **DP:** 4.37
- **Mín:** 5 | **Máx:** 30 | **Q25:** 22 | **Q75:** 29

### Distribuição de Frequências

| Score | n | % |
|---|---|---|
| ≤ 20 | 9 | 7.5% |
| 21–24 | 33 | 27.5% |
| 25–27 | 20 | 16.7% |
| 28–30 | 51 | 42.5% |
| Mín (5) | 1 | 0.8% |

> **Observação:** Distribuição assimétrica negativa (left-skewed). A maioria dos pacientes (43.3%) concentra-se entre 27 e 29 pontos. Apenas 16.7% (20 pacientes) têm score abaixo de 22, indicando comprometimento cognitivo clinicamente relevante.

---

## 3. Variáveis Clínicas — Estatísticas Descritivas

### 3.1 Variáveis Contínuas

| Variável | Média | DP | Mín | Máx | Mediana |
|---|---|---|---|---|---|
| Idade (anos) | 71.2 | 8.87 | 41 | 88 | 72 |
| Escolaridade (anos) | 7.52 | 3.71 | 0 | 12 | 8 |
| Tempo DM (anos) | 13.95 | 9.61 | 1 | 44 | 12 |
| IMC (kg/m²) | 29.69 | 5.24 | 19.9 | 46.7 | 29.6 |
| PAS (mmHg) | 141.3 | 20.0 | 100 | 203 | 140.5 |
| PAD (mmHg) | 82.8 | 11.4 | 55 | 124 | 80.5 |
| HbA1c (%) | 7.63 | 1.82 | 4.9 | 12.4 | 7.1 |
| Glicemia (mg/dL) | 141.6 | 53.5 | 62 | 370 | 127.5 |
| LDL (mg/dL) | 101.1 | 33.7 | 28 | 191 | 99.5 |
| HDL (mg/dL) | 50.5 | 12.5 | — | — | — |
| CKD-EP (mL/min) | 73.0 | 19.8 | 12.7 | 112.4 | 75.4 |
| Microalbuminúria | 102.9 | 334.4 | 0.17 | 2245.9 | 7.47 |
| Risco PREVENT 10Y (%) | 25.2 | 7.8 | 3.65 | 51.0 | 25.2 |

### 3.2 Variáveis Binárias / Categóricas

| Variável | Categoria 0 | Categoria 1 |
|---|---|---|
| DC (Declínio Cognitivo) | 86 (71.7%) | 34 (28.3%) |
| Sexo | F=68 (56.7%) | M=52 (43.3%) |
| HAS (Hipertensão) | Não: 21 (17.5%) | Sim: 99 (82.5%) |
| Dislipidemia | Não: 53 (44.2%) | Sim: 67 (55.8%) |
| RD (Retinopatia Diabética) | Não: 68 (56.7%) | Sim: 52 (43.3%) |
| Estatina | Não: — | Sim: — |
| Infarto | Baixa prevalência | — |
| AVC | Baixa prevalência | — |

| Variável | Categorias |
|---|---|
| Score Framingham | Médio: 45 (37.5%), Alto: 41 (34.2%), Baixo: 34 (28.3%) |
| Risco PREVENT Cat. | Alto (>20%): 87 (72.5%), Intermediário: 24 (20%) |
| NAC | Sem NAC: 70 (58.3%), NAC Instalada: 26 (21.7%), NAC >180d: 17 (14.2%), Incipiente: 6 (5%) |

---

## 4. Proteômica — 93 Proteínas Lagrimal

- **Escala:** Log-normalizada, centrada em 0 (z-score-like)
- **Range geral:** ~-4.4 a +5.2
- **Média das médias:** próximo de 0 (por design da normalização)
- **DP médio:** ~0.85–1.03

### Correlações com rMMSE_soma (Top 10 proteínas, excluindo MMSE-subítens)

| Proteína | r | Direção |
|---|---|---|
| PZP | -0.291 | Negativa |
| APOA4 | +0.266 | Positiva |
| QSOX1 | -0.264 | Negativa |
| HRG | -0.258 | Negativa |
| PLG | -0.237 | Negativa |
| ECM1 | -0.224 | Negativa |
| MST1 | -0.222 | Negativa |
| HGFAC | -0.220 | Negativa |
| SERPINA1 | — | — |
| ALB | — | — |

> Padrão: maioria das proteínas com correlação **negativa** (maior concentração proteica = menor score cognitivo).

---

## 5. Imagem Retiniana (AutoMorph) — 54 Variáveis

- **Missings:** OD/OE: 23–29% ausentes; AVG: ~10.8% ausentes (n efetivo ≈ 107)
- **Pares:** Olho Direito (OD), Olho Esquerdo (OE), Média (AVG)
- **Domínios:** Fractal dimension, Vessel density, Average width, Distance tortuosity, Squared curvature tortuosity, Tortuosity density
- **Subgrupos:** Global, Artérias, Veias

### Estatísticas AVG — Variáveis Globais

| Variável | Média | DP | Mín | Máx |
|---|---|---|---|---|
| AVG_Fractal_dimension | 1.434 | 0.044 | 1.274 | 1.522 |
| AVG_Vessel_density | 0.059 | 0.012 | 0.027 | 0.093 |
| AVG_Average_width | 36.092 | 2.438 | 30.726 | 41.794 |
| AVG_Distance_tortuosity | 3.833 | 1.492 | 1.448 | 10.06 |
| AVG_Tortuosity_density | 0.719 | 0.035 | 0.629 | 0.801 |

### Correlações com rMMSE_soma (variáveis AVG)

| Variável | r | Direção |
|---|---|---|
| AVG_Distance_tortuosity | -0.215 | Negativa |
| AVG_Squared_curvature_tortuosity | -0.205 | Negativa |
| AVG_Vein_Vessel_density | +0.180 | Positiva |
| AVG_Fractal_dimension | +0.178 | Positiva |
| AVG_Tortuosity_density | — | — |

---

## 6. Valores Ausentes — Resumo

| Grupo de Variáveis | % Ausente | Observação |
|---|---|---|
| Proteômica (93 vars) | 0% | Completo |
| Variáveis clínicas principais | < 1% | Muito completo |
| Retinopatia (OD/OE) | 23–29% | Imagens não disponíveis para todos |
| AVG retinal | ~11% | Recomendado para análises |
| CIND(≤) | 71.7% | Variável parcialmente preenchida |
| 1,5DP(≤) | 84.2% | Idem — excluir de modelos |
| Microalbuminúria | 2.5% | Pequena proporção |

---

## 7. Perfil Clínico da Amostra

| Característica | Valor |
|---|---|
| N total | 120 pacientes |
| Sexo predominante | Feminino (56.7%) |
| Faixa etária | 41–88 anos (média 71 anos) |
| Escolaridade média | 7.5 anos (ensino fundamental) |
| Prevalência de HAS | 82.5% |
| Prevalência de Dislipidemia | 55.8% |
| Prevalência de RD | 43.3% |
| Prevalência de DC | 28.3% |
| DM duração média | 14 anos |
| Risco cardiovascular | 72.5% alto (>20% em 10 anos) |

---

*Gerado automaticamente a partir de `master_proteomics.csv` — NeuroApp / Retina APOE Study*
