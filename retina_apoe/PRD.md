# Retina x APOE — Product Requirements Document

## Objetivo

Investigar se métricas vasculares da retina (extraídas de imagens de fundo de olho) correlacionam com o genótipo APOE, controlando para confundidores (idade, sexo, HAS, DM).

**Hipótese original:** Portadores de alelo ε4 (risco de demência) apresentam alterações vasculares retinianas mensuráveis — maior tortuosidade, menor dimensão fractal, menor densidade vascular — em comparação com portadores de ε3 (neutro) e ε2 (proteção).

**Achados preliminares (N=43):** As métricas **arteriais** (fractal dimension, vessel density, average width) mostraram tendência linear significativa com dose de ε4, porém na direção **oposta** à hipótese — valores **maiores** com mais ε4, sugerindo remodelamento/dilatação arterial ao invés de rarefação.

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
- **Escopo:** Somente Tauá-CE (156 exames laudados)
- **Resultado:** 138 pacientes matched (nome encontrado em ambas as fontes), 112 com imagens locais disponíveis, 190 imagens totais (OD + OE)

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

### Etapa 3 — AutoMorph
Duas opções disponíveis:

#### 3a — Google Colab (`03_automorph_colab.ipynb`)
- GPU T4 gratuita no Colab
- Clona AutoMorph, instala dependências (incluindo `efficientnet_pytorch`)
- Upload das imagens via ZIP, executa `bash run.sh`
- Download dos resultados como `automorph_results_v2.zip`

#### 3b — Execução Local (`03_run_automorph_local.py`)
- Suporte Windows e Linux, detecção automática de GPU
- Flags: `--run` (executa), `--cpu` (força CPU), `--skip-quality` (pula filtro M1)
- **Requisito GPU:** PyTorch com CUDA compatível (RTX 5090/Blackwell precisa de nightly + CUDA 12.8+)

#### Pipeline AutoMorph (4 módulos):
1. **M0 — Preprocess:** Crop/resize das imagens
2. **M1 — Quality Assessment (EfficientNet-B4):** Classifica imagens como gradable/ungradable
3. **M2 — Segmentation:** Vasos, Artéria-Veia, Disco-Cup (somente imagens gradáveis de M1)
4. **M3 — Feature Extraction:** Métricas vasculares por zona (B e C)

**Dependência crítica:** M2 lê de `Results/M1/Good_quality/`. Se M1 falhar, M2 encontra 0 imagens → CSVs vazios.

### Etapa 4 — Análise Estatística (`04_analyze.py`)
- Merge métricas AutoMorph + dados APOE + confundidores (normaliza extensões .jpg/.png)
- Modelo de dose-resposta APOE: e2e2=-2, e2e3=-1, e3e3=0, e3e4=+1, e4e4=+2
- Testes estatísticos:
  - ANOVA / Kruskal-Wallis por genótipo
  - Teste de tendência linear (Pearson + Spearman)
  - Regressão múltipla: métrica ~ apoe_dose + idade + sexo + HAS + DM (requer statsmodels)
- Visualizações (métricas-chave + significativas, ~25 de 68):
  - Gráficos de barras por genótipo com trend line e p-valor
  - Box plots com pontos individuais
- Output: `final_dataset.csv`, `figures/`

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
├── .gitignore                      # Ignora arquivos gerados e pesados
├── 01_match_patients.py            # Cruzamento de dados
├── 02_prepare_images.py            # Preparação de imagens para AutoMorph
├── 03_automorph_colab.ipynb        # Notebook Colab para rodar AutoMorph
├── 03_run_automorph_local.py       # Script para rodar AutoMorph localmente
├── 04_analyze.py                   # Análise estatística
├── matched_patients.csv            # (gerado) pacientes cruzados
├── image_manifest.csv              # (gerado) manifest de imagens com genótipo
├── final_dataset.csv               # (gerado) dataset consolidado final
├── automorph_input/                # (gerado) imagens preparadas
├── automorph_results/              # (gerado) CSVs do AutoMorph
│   ├── Macular_Features.csv        #   68 métricas × N imagens (output principal)
│   ├── Disc_Features.csv           #   métricas disc-centred (pode ficar vazio)
│   ├── results_ensemble.csv        #   predições de qualidade M1
│   └── crop_info.csv               #   info de preprocessing M0
├── figures/                        # (gerado) gráficos de barras e boxplots
├── laudados_2026-02-26.csv         # Input: laudos médicos
├── APOE_TAUÁ_ID.xlsx               # Input: genótipo APOE (Tauá)
└── dados_APOE.xlsx                 # Input: genótipo APOE (completo, reserva)
```

## Resultados (Execução de 26/02/2026)

### Pipeline executado
| Etapa | Input | Output | Observação |
|-------|-------|--------|------------|
| 01_match | 450 laudos + 800 APOE | 138 matched, 112 com imagens, 190 imgs | Tauá-CE only |
| 02_prepare | 190 imagens locais | `automorph_input/` + manifest | 11.07 μm/px default |
| 03_automorph (Colab) | 190 imagens | 43 gradáveis (M1), 68 métricas | 77% filtrado por qualidade |
| 04_analyze | 43 imgs × 68 métricas | 50 gráficos + tabelas estatísticas | |

### Distribuição de genótipos (43 imagens analisáveis, 35 pacientes)
| Genótipo | N imagens | Perfil |
|----------|-----------|--------|
| e2e2 | 1 | Proteção máxima |
| e2e3 | 10 | Proteção |
| e3e3 | 20 | Neutro |
| e3e4 | 8 | Risco |
| e4e4 | 4 | Risco máximo |

### Achados significativos — Tendência linear dose-resposta (p < 0.05)

Todas as 5 métricas significativas são **arteriais** e **aumentam** com a dose de ε4:

| Métrica | Pearson r | p-valor | Interpretação |
|---------|----------|---------|---------------|
| Artery_Average_width | 0.375 | **0.013** | Artérias mais largas com ε4 |
| Artery_Vessel_density | 0.345 | **0.023** | Maior densidade arterial com ε4 |
| Artery_Fractal_dimension | 0.333 | **0.029** | Mais ramificação arterial com ε4 |
| Artery_Fractal_dimension_zone_c | 0.345 | **0.025** | Idem na zona C (periferia) |
| Artery_Average_width_zone_c | 0.314 | **0.043** | Idem na zona C |

### Tendências marginais (Kruskal-Wallis p < 0.10)
- Artery_Fractal_dimension (H=9.371, p=0.052)
- Artery_Vessel_density (H=8.897, p=0.064)
- Artery_Average_width (H=7.865, p=0.097)
- CRVE_Hubbard_zone_b (H=8.323, p=0.080)
- Artery_Tortuosity_density_zone_c (H=8.876, p=0.064)
- CRVE_Knudtson_zone_c (H=7.921, p=0.095)

### Interpretação preliminar
- Os achados apontam para um **padrão arterial** (não venular) associado ao ε4
- A direção (↑ largura, ↑ densidade, ↑ fractal) sugere possível **remodelamento vascular** nos portadores de risco
- O CRVE (calibre venular) também mostra tendência marginal, consistente com literatura sobre calibre e demência
- Nenhuma métrica atingiu p < 0.05 no Kruskal-Wallis (apenas na tendência linear), possivelmente pelo N pequeno

### O que não rodou
- **Regressão múltipla** (controle de confundidores): statsmodels incompatível com NumPy instalado (`np.long` removido)
- **Disc_Features.csv**: veio vazio (AutoMorph não extraiu métricas disc-centred para estas imagens)

## Limitações Conhecidas

1. **N pequeno nos extremos:** e2e2=1 e e4e4=4 — insuficientes para conclusões robustas nesses grupos
2. **Alto filtro de qualidade M1:** 77% das imagens filtradas (190→43). Pode ser relaxado com `--skip-quality` no script local.
3. **Resolução da câmera:** Usando default ~11 μm/pixel (Phelcom EyerCloud, FOV ~45°). Medidas absolutas (CRAE, CRVE, largura em μm) podem ter offset sistemático, mas comparações relativas entre genótipos são válidas.
4. **Sem controle de confundidores:** A regressão múltipla (idade, sexo, HAS, DM) não rodou. Os achados da tendência linear podem ser confundidos por essas variáveis.
5. **Matching por nome:** Sujeito a erros por variações de grafia. Revisão manual recomendada.
6. **Disc features ausentes:** AutoMorph não gerou Disc_Features para nenhuma imagem. Pode estar relacionado à resolução ou à detecção de disco nas imagens Phelcom.

## Próximos Passos

1. **Corrigir statsmodels** (`pip install --upgrade statsmodels numpy`) e rodar regressão múltipla
2. **Expandir N:** Incluir pacientes de Jaci-SP e Campos do Jordão (se tiverem dados APOE)
3. **Relaxar filtro de qualidade:** Usar `--skip-quality` para analisar mais imagens (190 em vez de 43)
4. **Disc-centred analysis:** Investigar por que Disc_Features ficou vazio
5. **Publicação:** Se achados confirmados após controle de confundidores, preparar manuscrito explorando biomarcadores retinianos de risco APOE
