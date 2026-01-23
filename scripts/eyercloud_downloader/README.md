# EyerCloud Image Downloader

Este script automatiza o download de todas as imagens de exames do EyerCloud. Ele agora conta com login automatizado via Playwright e processamento assíncrono para maior velocidade.

## Pré-requisitos

1. Python 3 instalado.
2. Instalar dependências e Playwright:
   ```bash
   pip install -r requirements.txt
   playwright install chromium
   ```

## Como usar

### 1. Configurar Credenciais
O script não precisa mais que você copie cookies manualmente. Ele usa suas credenciais de acesso.

1. Renomeie o arquivo `.env.example` para `.env`.
2. Edite o arquivo `.env` e preencha com seu e-mail e senha do EyerCloud:
   ```env
   EYERCLOUD_USUARIO=seu_email@exemplo.com
   EYERCLOUD_SENHA=sua_senha
   ```

### 2. Executar
Abra o terminal na pasta do script e execute:
```bash
python downloader.py
```

## Funcionalidades
- **Login Automático**: Faz login sozinho usando Playwright.
- **Extração de Metadados**: Captura CPF, Data de Nascimento, Sexo e Histórico de Doenças (Diabetes, Glaucoma, etc.).
- **Multiclínicas**: Detecta e baixa exames de todas as clínicas vinculadas à conta.
- **Download Assíncrono**: Baixa múltiplas imagens simultaneamente.
- **Detecção de URL**: Identifica automaticamente o servidor de imagens (CloudFront).
- **Registro de Download**: O arquivo `download_state.json` garante que exames já baixados não sejam processados novamente.

## Upload para Bytescale (CDN)
Após o download, use o script de upload para disponibilizar as imagens no NeuroApp:
```bash
python bytescale_uploader.py
```
Este script gera o `bytescale_mapping.json` usado pela interface do app.

## Estrutura de Pastas
- As imagens são salvas na pasta configurada no `.env` (padrão `downloads/`).
- Cada pasta segue o padrão `Nome_Paciente_IDExame`.
