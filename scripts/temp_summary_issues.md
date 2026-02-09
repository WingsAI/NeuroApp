# Problemas de Imagens Identificados (2026-02-09)

## Resumo Executivo

- **297 exams** baixados do EyerCloud mas **NÃO uploadados** para Bytescale (sem imagens no app)
- **15 exams** no DB com **menos imagens** do que o esperado (uploads parciais)
- **68 pacientes** com **múltiplos exams no mesmo dia** (mesmos horários = duplicados CML/cloud mapping)
- **0 pacientes** no EyerCloud que não estão no DB (todos já foram importados)

## Problema 1: Exams baixados mas não uploadados (297 exams)

**Causa:** Imagens foram baixadas do EyerCloud para o disco local mas nunca foram uploadadas para Bytescale usando `bytescale_uploader.py`.

**Exemplos dos casos reportados:**
- APARECIDO ROBERTO LOCAISE - exam_id: 69809d9f51ffa0242a2cdddb, expected: 5 images ✅
- IVAN LÚCIO DE LIMA - exam_id: 6980eb661fa8062e17d3e4cb, expected: 10 images ✅
- HELENA MARIA SOUZA DOMINGUEZ - exam_id: 69809d871fa8062e17d3adba, expected: 20 images ✅
- DJALMA (2 exams):
  - 698386be6c333284694515cb, expected: 1 image ✅
  - 6983859f6c3332846945148c, expected: 7 images ✅

**Solução:** Rodar `bytescale_uploader.py` para fazer upload das imagens locais para Bytescale, depois importar para o DB.

## Problema 2: Uploads parciais (15 exams)

Exams que têm ALGUMAS imagens no DB mas estão faltando imagens:

1. HELENA MARIA SOUZA DOMINGUEZ - expected: 11, actual: 4, missing: 7 ⚠️
2. JUVINA GINO PEREIRA - expected: 5, actual: 0, missing: 5
3. YASMIN GABRIELLA DOS SANTOS FREITAS - expected: 5, actual: 3, missing: 2
4. APARECIDO ROBERTO LOCAISE - expected: 2, actual: 0, missing: 2 (este está no problema 1)
5. NATALINA DA SILVA DAMASCENO - expected: 7, actual: 5, missing: 2
6. Outros 10 exams com 1 imagem faltando cada

**Causa:** Bytescale upload foi interrompido ou algumas imagens não foram uploadadas.

**Solução:** Re-upload das imagens faltantes.

## Problema 3: Múltiplos exams duplicados (68 pacientes)

Pacientes com 2+ exams no MESMO DIA e MESMO HORÁRIO. Estes são duplicados do cloud mapping ou CML.

**Exemplo crítico - Djalma:**
```
DJALMA APARECIDO LOURENÇO:
  - 2026-02-04 12:15:52, 7 images, eyerCloudId: 6983859f6c3332846945148c
  - 2026-02-04 12:27:53, 1 images, eyerCloudId: 698386be6c333284694515cb
```

**Observação:** Estes são 2 exams DIFERENTES (eyerCloudId diferentes), realizados com 12 minutos de diferença. Não são duplicados! São 2 consultas reais no mesmo dia.

**Para Djalma:** No EyerCloud, o primeiro exam tem 5 COLOR + 2 ANTERIOR (7 total). O segundo exam tem 1 COLOR. No DB ambos estão corretos: 7 e 1 imagem. **PROBLEMA:** As imagens não foram uploadadas para Bytescale (estão no problema 1).

**Outros casos (duplicados verdadeiros):**
- Muitos pacientes aparecem com 2 exams com MESMO eyerCloudId e MESMO número de imagens → duplicados CML/cloud mapping

**Solução para duplicados:** Rodar script para consolidar/deletar exams duplicados (mesmo eyerCloudId).

**Solução para Djalma:** Nada a fazer nos exams - estão corretos. Apenas precisa fazer upload das imagens (problema 1). Na UI, mostrar data+hora para distinguir os 2 exams.

## Problema 4: Data de nascimento do Ivan Lucio

**Reportado:** "o paciente Ivan Lucio de Lima no eyercloud a data de nascimento está diferente da nossa"

**Achado:** Ivan Lucio NÃO está no DB (0 pacientes encontrados).

**Causa:** Exam dele está no problema 1 (baixado mas não uploadado).

**Solução:** Upload das imagens + import do paciente.

## Recomendações de Ação

### Curto prazo (urgente):
1. Rodar `bytescale_uploader.py` para fazer upload dos 297 exams faltantes
2. Importar os novos uploads para o DB usando `sync_eyercloud_full.js`
3. Rodar script para deletar exams duplicados (mesmo eyerCloudId, mesmo patient)

### Médio prazo:
4. Modificar a UI para mostrar data+hora dos exams quando um paciente tem múltiplos exams no mesmo dia
5. Adicionar validação no `bytescale_uploader.py` para garantir que todos os exams sejam uploadados (checklist)

### Longo prazo:
6. Migrar de Bytescale para S3 direto (já temos S3 configurado, seria mais confiável)
