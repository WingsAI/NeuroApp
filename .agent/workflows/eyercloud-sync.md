---
description: Workflow completo de sincronização EyerCloud após grandes updates
---

# Workflow de Sincronização EyerCloud

Este workflow deve ser executado após cada grande atualização de dados do EyerCloud.

## Pré-requisitos

- Acesso ao EyerCloud (login)
- Node.js e Python instalados
- Playwright instalado (`pip install playwright && playwright install chromium`)

## Passos

### 1. Baixar novos dados do EyerCloud (se necessário)

// turbo
```powershell
cd e:\GitHub\NeuroApp\scripts\eyercloud_downloader
$env:PYTHONIOENCODING='utf-8'; python downloader_playwright.py
```

Se a sessão expirou, faça login no navegador que abrir e pressione ENTER.

### 2. Fazer upload das imagens para o Bytescale

// turbo
```powershell
cd e:\GitHub\NeuroApp\scripts\eyercloud_downloader
$env:PYTHONIOENCODING='utf-8'; python bytescale_uploader.py
```

### 3. Limpar duplicatas do mapping

// turbo
```powershell
cd e:\GitHub\NeuroApp
python scripts/clean_mapping.py
```

### 4. Atualizar metadados faltantes (se necessário)

```powershell
cd e:\GitHub\NeuroApp
$env:PYTHONIOENCODING='utf-8'; python scripts/fix_metadata.py
```

Se a sessão expirou, delete `auth_state.json` e refaça o login no passo 1.

### 5. Sincronizar com o banco de dados

// turbo
```powershell
cd e:\GitHub\NeuroApp
node scripts/fix_all_data.js --execute
```

### 6. Validar os dados (OBRIGATÓRIO)

// turbo
```powershell
cd e:\GitHub\NeuroApp
node scripts/validate_data.js
```

### 7. Validar paciente específico (opcional)

```powershell
cd e:\GitHub\NeuroApp
node scripts/validate_data.js --patient "NOME DO PACIENTE"
```

## Critérios de Sucesso

A validação deve passar com:
- ≥95% dos pacientes com exames associados
- ≥95% dos pacientes com imagens associadas
- 0 erros críticos (datas no futuro, dados corrompidos)

## Troubleshooting

### Sessão expirada
```powershell
del scripts\eyercloud_downloader\auth_state.json
```
Depois, rode o downloader novamente e faça login.

### Dados ainda faltando após sync
Execute o script de metadados para buscar os dados diretamente da API:
```powershell
$env:PYTHONIOENCODING='utf-8'; python scripts/fix_metadata.py
node scripts/fix_all_data.js --execute
```

### Imagens não aparecem
Verifique se o bytescale_mapping tem as URLs:
```powershell
node -e "const m = require('./scripts/eyercloud_downloader/bytescale_mapping_cleaned.json'); const p = Object.values(m).find(x => x.patient_name.includes('NOME')); console.log(p.images?.length || 0, 'imagens');"
```
