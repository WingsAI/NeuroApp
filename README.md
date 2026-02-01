# NeuroApp - Sistema de Neuroftalmologia

Plataforma web para gestão de imagens e laudos médicos neuroftalmológicos, desenvolvida com Next.js 14 e TypeScript.

## Visão Geral

NeuroApp é uma solução completa para conectar técnicos em radiologia e médicos especializados através de um fluxo digital de trabalho. O sistema permite:

- **Registro de Pacientes**: Técnicos podem registrar pacientes e fazer upload de imagens médicas.
- **Analytics**: Dashboard avançado com métricas de produtividade e indicadores em tempo real.
- **Terminal de Análise**: Médicos especializados elaboram laudos com integração ao EyerCloud.
- **Fluxo de Encaminhamento**: Gestão completa de encaminhamentos para a rede de saúde (Referrals).
- **Sincronização com Google Drive**: Upload automatizado de laudos PDF para armazenamento institucional.
- **Rastreabilidade**: Fluxo completo desde a triagem até o desfecho na Atenção Especializada.

## Funcionalidades Principais

### 1. Registro e Triagem
- Cadastro sociodemográfico completo (CPF, Idade, Escolaridade).
- Upload de imagens médicas para Bucket S3.
- Histórico clínico e comorbidades (Hipertensão, Diabetes, etc).

### 2. Terminal Médico (Laudo)
- Sincronização automática com EyerCloud.
- Diagnóstico detalhado por olho (OD/OE).
- Classificação de qualidade de imagem (Satifatória, Insatisfatória, Impossível).
- Marcadores específicos para Retinopatia Diabética, Glaucoma e Retinopatia Hipertensiva.

### 3. Gestão de Encaminhamentos (Referrals)
- Visualização em lista horizontal com filtros avançados.
- **Bulk Scheduling**: Seleção múltipla de pacientes para agendamento em lote.
- Controle de data de agendamento e status de prioridade (Rotina, Urgência, Emergência).

### 4. Consultório de Resultados
- Visualização imediata de laudos concluídos.
- **Sync Google Drive**: Botão dedicado para envio de laudos técnicos em PDF para pasta institucional.
- Impressão otimizada com layout pericial.
- Status visuais para re-exame necessário/urgente.

## Tecnologias Utilizadas

- **FW**: Next.js 14 (App Router)
- **Linguagem**: TypeScript
- **Banco de Dados**: PostgreSQL via Prisma ORM
- **Estilização**: Tailwind CSS + Estética Premium (Glassmorphism/Dark Mode)
- **PDF/Sync**: Puppeteer (headless) + Google Drive API
- **Ícones**: Lucide React

## Variáveis de Ambiente Necessárias

```env
# Database
DATABASE_URL="postgresql://..."

# Storage (AWS S3)
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_BUCKET_NAME="..."
AWS_REGION="..."

# Google Drive Sync
GOOGLE_SERVICE_ACCOUNT_EMAIL="..."
GOOGLE_PRIVATE_KEY="..."
NEXT_PUBLIC_APP_URL="https://seu-dominio.com"
NEXT_PUBLIC_ENABLE_DRIVE_SYNC="true" # Define como "false" ou remova para desativar o botão
```

## Estrutura de Metadados de Diagnóstico

O sistema utiliza uma estrutura JSON para `diagnosticConditions` que inclui:
- `normal`: Exame sem alterações
- `drMild`, `drModerate`, `drSevere`, `drProliferative`: Retinopatia Diabética
- `glaucomaSuspect`: Suspeita de Glaucoma
- `hrMild`, `hrModerate`, `hrSevere`: Retinopatia Hipertensiva
- `others`: Outros achados

---

© 2025-2026 NeuroApp. Todos os direitos reservados.
**Versão**: 1.2.0
**Status**: Produção / Em Evolução

