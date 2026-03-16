# Insights — Proteômica, Retina e Cognição em DM2

**Data:** 2026-03-12
**Estudo:** Retina APOE — Cognição, Proteômica Lagrimal e Imagem Retiniana em Diabetes Tipo 2
**Tags:** #PhD #Saude #Academia

---

## Insight 1 — A Cognição na Amostra Está Relativamente Preservada, Mas com Heterogeneidade Clínica Relevante

O score médio do rMMSE é 25 (em 30), com mediana 26.5 — indicando cognição preservada na maioria. Porém, a distribuição é **bimodal**: 43% dos pacientes se concentram em 27–29 (normal/alto), enquanto 16.7% estão abaixo de 22 (zona de comprometimento cognitivo leve).

**Implicação clínica:** Há um subgrupo de ~20 pacientes com comprometimento real que deve ser o foco das análises de predição. O modelo preditivo precisará lidar com dados desbalanceados se tratado como classificação binária.

---

## Insight 2 — Escolaridade é o Preditor Não-Cognitivo Mais Forte

Entre variáveis independentes (excluindo sub-itens MMSE e duplicatas), **Escolaridade em anos** apresenta a correlação mais forte com rMMSE_soma (r = +0.495). Isso é esperado pelo efeito de reserva cognitiva, mas tem implicação metodológica:

- **Risco de confundimento:** A escolaridade pode mascarar associações biológicas reais.
- **Recomendação:** Incluir Escolaridade como covariável de controle em todos os modelos.
- A maioria dos pacientes tem apenas ensino fundamental (média 7.5 anos), sugerindo **baixa reserva cognitiva** como característica da amostra.

---

## Insight 3 — Proteínas Lagrimal Associam-se com Cognição: PZP e APOA4 como Biomarcadores Candidatos

Dentre as 93 proteínas, destacam-se:

| Proteína | r | Mecanismo Putativo |
|---|---|---|
| **PZP** (Pregnancy Zone Protein) | -0.291 | Proteína de fase aguda; elevada em inflamação sistêmica |
| **APOA4** (Apolipoproteína A-IV) | +0.266 | Transporte lipídico; papel neuroprotetor no SNC |
| **QSOX1** (Quiescin Sulfhydryl Oxidase 1) | -0.264 | Stress oxidativo; maior nível = mais oxidação |
| **HRG** (Histidine-Rich Glycoprotein) | -0.258 | Modulação imune/coagulação; marcador de inflamação |
| **PLG** (Plasminogênio) | -0.237 | Sistema fibrinolítico; implicado na clearance de amiloide |
| **ECM1** (Extracellular Matrix Protein 1) | -0.224 | Integridade da BHE e matrix extracelular |
| **MST1** (Macrophage Stimulating 1) | -0.222 | Ativação macrofágica; neuroinflamação |

**Padrão dominante:** A maioria das associações proteicas é **negativa** — maior concentração lagrimal associa-se a menor performance cognitiva. Isso é compatível com o modelo de que proteínas inflamatórias e de stress estão elevadas em pacientes com pior função cognitiva.

**APOA4 é exceção** — sua associação positiva é biologicamente plausível dado seu papel neuroprotetor e anti-inflamatório no transporte de lipídios cerebrais.

---

## Insight 4 — Tortuosidade Retiniana é o Biomarcador de Imagem Mais Relevante

Dentre as 54 variáveis retinais:

- **AVG_Distance_tortuosity** (r = -0.215) e **AVG_Squared_curvature_tortuosity** (r = -0.205) associam-se negativamente à cognição.
- **AVG_Fractal_dimension** (r = +0.178) e **AVG_Vein_Vessel_density** (r = +0.180) associam-se positivamente.

**Interpretação biológica:**
- Alta tortuosidade = vasos retinianos mais tortuosos = maior dano microvascular = pior perfusão neural
- Maior fractal dimension = rede vascular mais complexa e densa = melhor saúde vascular retiniana
- A retina como "janela para o cérebro": esses padrões vasculares espelham a microvasculatura cerebral

**Implicação diagnóstica:** A tortuosidade retiniana pode servir como **biomarcador não-invasivo de risco de declínio cognitivo** em DM2 — mensurável por fundoscopia ou OCT-A sem necessidade de coleta de LCR ou proteômica.

---

## Insight 5 — Duração do DM Supera Controle Glicêmico como Preditor Cognitivo

- **Tempo DM (anos):** r = -0.305 com rMMSE
- **HbA1c:** correlação fraca (< 0.15)
- **Glicemia:** correlação fraca

Isso sugere que o **acúmulo temporal de exposição hiperglicêmica** é mais danoso que o nível glicêmico pontual. Pacientes com DM há mais anos têm pior cognição, independente do controle atual — consistente com a hipótese de dano cumulativo por AGEs (produtos finais de glicação avançada) e inflamação crônica de baixo grau.

---

## Insight 6 — Alto Risco Cardiovascular Domina a Amostra

- 72.5% dos pacientes têm risco cardiovascular **alto (>20% em 10 anos)** pelo escore PREVENT
- 82.5% têm hipertensão (HAS)
- 55.8% têm dislipidemia

Essa concentração de fatores de risco vascular sugere que a **doença cerebrovascular subclínica** pode ser um mediador importante entre DM2 e cognição nessa amostra — mais relevante que a via amiloide/tau direta.

---

## Insight 7 — Dados Retinais Incompletos Limitam Análises Bilaterais

- OD e OE têm 23–29% de missings (apenas ~86–92 pacientes com dados completos de ambos os olhos)
- Análises com variáveis AVG (média OD+OE) preservam ~107 pacientes (~89%)
- **Recomendação:** Priorizar variáveis AVG em modelos preditivos. Analisar se missingness é aleatório (MCAR) ou relacionado à gravidade da retinopatia.

---

## Insight 8 — Integração Multimodal: Proteômica + Retina + Clínica

O valor preditivo máximo deve vir da **integração** de:
1. **Biomarcadores proteicos lagrimal** (inflamação, transporte lipídico)
2. **Morfologia retiniana** (tortuosidade, densidade vascular)
3. **Variáveis clínicas** (escolaridade, duração DM, idade)

Cada modalidade captura aspectos distintos da fisiopatologia:
- Proteômica → inflamação sistêmica e local, stress oxidativo
- Retina → dano microvascular cumulativo
- Clínica → reserva cognitiva e carga de doença

Um modelo integrado (late fusion ou feature concatenation) deve superar modelos unimodais.

---

## Insight 9 — Hipótese Principal para o Modelo Preditivo

> **"A combinação de PZP elevado, APOA4 reduzido, maior tortuosidade retiniana e menor escolaridade forma um perfil de risco para pior performance cognitiva (rMMSE baixo) em pacientes com DM2."**

Essa hipótese é biologicamente coerente e pode ser testada com regressão penalizada (Elastic Net) ou Random Forest com importância de variáveis.

---

## Insight 10 — Considerações para Publicação

| Aspecto | Observação |
|---|---|
| Tamanho amostral | N=120 é adequado para análise exploratória; pode ser limitante para modelos complexos |
| Múltiplas comparações | 93 proteínas = risco de falsos positivos; usar FDR correction ou penalização Lasso |
| Normalidade | rMMSE_soma é discreta e assimétrica; considerar modelos não-paramétricos ou transformação |
| Confundidores | Sempre ajustar por Escolaridade e Idade nos modelos |
| Validação | Com N=120, usar cross-validation (LOOCV ou 5-fold) em vez de split treino-teste |

---

*Gerado automaticamente a partir de `master_proteomics.csv` — NeuroApp / Retina APOE Study*
