---
name: EyerCloud Sync
description: Sincronização de pacientes do EyerCloud para o NeuroApp, incluindo download de imagens, upload para Bytescale e sync com banco de dados.
---

# EyerCloud Sync Skill

Este skill documenta o processo completo de sincronização de pacientes do EyerCloud para o NeuroApp.

## Visão Geral do Pipeline

```
EyerCloud (site) → downloader_playwright.py → downloads/ → bytescale_uploader.py → bytescale_mapping.json → sync_to_db.js → Database
```

## Arquivos Importantes

| Arquivo | Localização | Descrição |
|---------|-------------|-----------|
| `downloader_playwright.py` | `scripts/eyercloud_downloader/` | Baixa imagens do EyerCloud |
| `bytescale_uploader.py` | `scripts/eyercloud_downloader/` | Faz upload para o Bytescale |
| `sync_to_db.js` | `scripts/` | Sincroniza bytescale_mapping.json para o DB |
| `download_state.json` | `scripts/eyercloud_downloader/` | Estado dos downloads (exames baixados) |
| `bytescale_mapping.json` | `scripts/eyercloud_downloader/` | Mapeamento de pacientes e URLs no Bytescale |
| `auth_state.json` | `scripts/eyercloud_downloader/` | Cookies de autenticação do EyerCloud |

## Problemas Comuns e Soluções

### 1. Pacientes com Status "⚠️ Incompleto"

**Causa:** O download de algumas imagens falhou (timeout, erro de rede, etc.)

**Solução:**
```powershell
cd scripts/eyercloud_downloader
python downloader_playwright.py --retry
```

O modo `--retry` identifica exames incompletos e tenta baixar novamente.

### 2. Pacientes com Status "❓ Não rastreado"

**Causa:** Paciente existe no EyerCloud mas não foi processado (pode ser duplicata ou exame novo).

**Solução:**
1. Verifique se é uma duplicata (mesmo nome, ID diferente)
2. Se for um exame novo, use o modo interativo:
```powershell
python downloader_playwright.py --interactive
```
3. Navegue até a página do paciente no navegador e pressione ENTER para baixar

### 3. Sessão Expirada (TimeoutError)

**Causa:** Os cookies de autenticação expiraram.

**Solução:**
```powershell
del auth_state.json
python downloader_playwright.py
# Faça login manualmente no navegador que abriu
# Pressione ENTER após o login
```

### 4. bytescale_mapping.json Não Atualizado

**Causa:** O uploader não foi executado após o download.

**Solução:**
```powershell
cd scripts/eyercloud_downloader
python bytescale_uploader.py
```

### 5. Pacientes Não Aparecem no App

**Causa:** O sync_to_db.js não foi executado.

**Solução:**
```powershell
# Copiar o mapping para a raiz do projeto
copy scripts\eyercloud_downloader\bytescale_mapping.json bytescale_mapping.json

# Executar o sync
node scripts/sync_to_db.js
```

### 6. Discrepância na Contagem de Pacientes

**Diagnóstico:**
```powershell
# Contar no EyerCloud (via relatório)
python downloader_playwright.py --report

# Contar no bytescale_mapping.json
python -c "import json; d=json.load(open('bytescale_mapping.json')); print('Pacientes:', len(d))"

# Contar no banco de dados (via Prisma)
node -e "const {PrismaClient}=require('@prisma/client'); new PrismaClient().patient.count().then(c=>console.log('DB:',c))"
```

## Workflow Completo de Sincronização

### Passo 1: Baixar Novos Pacientes
```powershell
cd scripts/eyercloud_downloader

# Se primeira vez ou sessão expirada
del auth_state.json
python downloader_playwright.py
# Faça login e pressione ENTER

# Se sessão válida
python downloader_playwright.py
```

### Passo 2: Re-tentar Downloads Incompletos
```powershell
python downloader_playwright.py --retry
```

### Passo 3: Upload para Bytescale
```powershell
python bytescale_uploader.py
```

### Passo 4: Sincronizar com Banco de Dados
```powershell
cd ../..
copy scripts\eyercloud_downloader\bytescale_mapping.json bytescale_mapping.json
node scripts/sync_to_db.js
```

### Passo 5: Verificar Resultado
```powershell
python scripts/eyercloud_downloader/downloader_playwright.py --report
```

## Lista de Pacientes com Problemas Atuais

### Incompletos (imagens faltando):
- NILSON HELIO LEAO (10 esperadas, 7 baixadas)
- NIVALDO BASSO (12 esperadas, 8 baixadas)
- REGINALDO ALVES DE JESUS ALMEIDA (16 esperadas, 13 baixadas)
- RENATO LUIZ VIANA (10 esperadas, 9 baixadas)
- RITA SIMONE PASTEGA LISBOA (10 esperadas, 7 baixadas)
- ROBSON TRIDICO (12 esperadas, 9 baixadas)
- ROSANA CRISTINA MONTEVERDE GINO (11 esperadas, 8 baixadas)
- TANIA SOUZA DOMINGUEZ (18 esperadas, 13 baixadas)
- TERESA BRIGUENTI CESARE (13 esperadas, 12 baixadas)
- VALDELIRIO OLIVEIRA COSTA (12 esperadas, 11 baixadas)
- VALDIR GORDONI (15 esperadas, 13 baixadas)
- VANESSA CARLA LOURENCO (13 esperadas, 11 baixadas)
- YASMIN GABRIELLA DOS SANTOS FREITAS (10 esperadas, 7 baixadas)
- YOLANDA REALE GOMES (12 esperadas, 10 baixadas)

### Para resolver estes pacientes incompletos:
```powershell
cd scripts/eyercloud_downloader
python downloader_playwright.py --retry
python bytescale_uploader.py
cd ../..
copy scripts\eyercloud_downloader\bytescale_mapping.json bytescale_mapping.json
node scripts/sync_to_db.js
```

## Notas Importantes

1. **Sempre verifique a sessão**: Se der TimeoutError, delete `auth_state.json` e faça login novamente.

2. **Modo interativo para problemas**: Use `--interactive` quando precisar baixar pacientes específicos.

3. **Backup do mapping**: Antes de rodar o uploader, faça backup do `bytescale_mapping.json`.

4. **Limite de imagens por exame**: O EyerCloud pode ter muitas imagens por paciente. O script filtra apenas imagens tipo "COLOR" para economizar espaço.

5. **Localização automática**: O `sync_to_db.js` atribui localização baseado na data do exame:
   - Até 15/01/2026 → Tauá-CE
   - 27-31/01/2026 → Jaci-SP
   - 02-05/02/2026 → Campos do Jordão
