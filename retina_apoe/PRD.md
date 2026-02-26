# Retina x APOE — Product Requirements Document

## Objetivo

Investigar se métricas vasculares da retina (extraídas de imagens de fundo de olho) correlacionam com o genótipo APOE, controlando para confundidores (idade, sexo, HAS, DM).

**Hipótese:** Portadores de alelo ε4 (risco de demência) apresentam alterações vasculares retinianas mensuráveis — maior tortuosidade, menor dimensão fractal, menor densidade vascular — em comparação com portadores de ε3 (neutro) e ε2 (proteção).

## Contexto da Literatura

- **Lacuna identificada:** Nenhum estudo publicado combinou AutoMorph (ou ferramenta similar) com genotipagem APOE em fundoscopia.
- **ARIC (N=10.036):** Calibre vascular não associado com APOE. Retinopatia fracamente associada com ε4 (OR ~1.3).
- **MESA:** Dimensão fractal sem interação significativa com APOE ε4 (mas medida manual, não automatizada).
- **Modelos murinos APOE4 (Abhyankar 2025):** Tortuosidade aumentada, densidade vascular reduzida.
- **OCTA:** Densidade capilar reduzida em portadores de ε4 (mas OCTA ≠ fundoscopia).
- **Oportunidade:** Ferramentas automatizadas modernas (AutoMorph) podem detectar sinais que métodos manuais antigos não capturaram.

## Dados

### Fontes
| Arquivo | Registros | Dados |
|---------|-----------|-------|
| `laudados_2026-02-26.csv` | 450 pacientes | Imagens OD/OE (URLs + local), achados clínicos, HAS, DM |
| `APOE_TAUÁ_ID.xlsx` | 800 pacientes | Genótipo APOE, HAS, DM, idade, sexo, escolaridade |
| `dados_APOE.xlsx` | 897 pacientes | Dataset APOE completo (reserva para expansão) |

### Cruzamento
- **Chave:** Nome normalizado (uppercase, sem acentos, espaços simplificados)
- **Escopo inicial:** Somente Tauá-CE (~156 exames laudados)
- **Estimativa de match:** ~100-150 pacientes com imagem + genótipo

### Critérios de Exclusão de Imagens
- Olho com `quality: "impossible"` no campo Achados → excluir aquela imagem
- Olho sem URL de imagem → excluir
- Paciente com ambos os olhos excluídos → excluir paciente

## Pipeline

### Etapa 1 — Cruzamento de Dados (`01_match_patients.py`)
- Normalizar nomes em ambas as fontes
- Match CSV ↔ APOE_TAUÁ_ID.xlsx
- Filtrar imagens impossíveis (JSON Achados)
- Determinar genótipo APOE a partir das colunas ε2ε2..ε4ε4
- Gerar `matched_patients.csv` com: nome, genótipo, idade, sexo, HAS, DM, path_OD, path_OE

### Etapa 2 — Preparação de Imagens (`02_prepare_images.py`)
- Mapear URLs Bytescale → arquivos locais em `downloads/`
- Copiar imagens matched para `automorph_input/` no formato esperado
- Gerar `resolution_information.csv` (default ~11 μm/pixel para Phelcom FOV 45°)

### Etapa 3 — AutoMorph (`03_automorph_colab.ipynb`)
- Google Colab notebook com GPU T4
- Clonar AutoMorph, instalar dependências
- Upload das imagens preparadas
- Executar pipeline completo: quality → segmentation → A/V → metrics
- Download do CSV de resultados

### Etapa 4 — Análise Estatística (`04_analyze.py`)
- Merge métricas AutoMorph + dados APOE + confundidores
- Métricas por genótipo (e2e2, e2e3, e3e3, e3e4, e4e4)
- Testes estatísticos:
  - ANOVA / Kruskal-Wallis por genótipo
  - Teste de tendência linear (dose-resposta e2→e3→e4)
  - Regressão múltipla: métrica ~ genótipo + idade + sexo + HAS + DM
  - Correlação parcial controlando confundidores
- Visualizações:
  - Gráficos de barras por genótipo (como o da dimensão fractal)
  - Box plots com pontos individuais
  - Heatmap de correlações

## Métricas Vasculares (AutoMorph)

| Métrica | Descrição | ICC |
|---------|-----------|-----|
| Fractal Dimension | Complexidade da rede vascular (Minkowski-Bouligand) | >0.9 |
| Tortuosity (3 métodos) | Curvatura dos vasos | Variável |
| Vessel Density | Proporção de pixels vasculares | >0.9 |
| Average Width | Largura média dos vasos (μm) | >0.9 |
| CRAE | Central Retinal Arteriolar Equivalent | >0.9 |
| CRVE | Central Retinal Venular Equivalent | >0.9 |
| AVR | Arteriolar-Venular Ratio | >0.9 |

## Estrutura do Projeto

```
retina_apoe/
├── PRD.md                          # Este documento
├── 01_match_patients.py            # Cruzamento de dados
├── 02_prepare_images.py            # Preparação de imagens para AutoMorph
├── 03_automorph_colab.ipynb        # Notebook Colab para rodar AutoMorph
├── 04_analyze.py                   # Análise estatística
├── matched_patients.csv            # Output: pacientes cruzados (gerado)
├── automorph_input/                # Imagens preparadas (gerado)
├── automorph_results/              # Resultados do AutoMorph (gerado)
├── figures/                        # Gráficos gerados (gerado)
├── laudados_2026-02-26.csv         # Input: laudos médicos
├── APOE_TAUÁ_ID.xlsx               # Input: genótipo APOE (Tauá)
└── dados_APOE.xlsx                 # Input: genótipo APOE (completo, reserva)
```

## Limitações Conhecidas

1. **N pequeno nos extremos:** e2e2 e e4e4 terão poucos pacientes (~2-11 no dataset APOE total)
2. **Resolução da câmera:** Usando default ~11 μm/pixel (Phelcom EyerCloud, FOV ~45°). Medidas absolutas (CRAE, CRVE, largura em μm) podem ter offset sistemático, mas comparações relativas entre genótipos são válidas.
3. **Qualidade de imagem:** Imagens "unsatisfactory" (mas não "impossible") serão incluídas; AutoMorph tem quality grading interno.
4. **Matching por nome:** Sujeito a erros por variações de grafia. Revisão manual recomendada.
