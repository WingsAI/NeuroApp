# Guia de Banco de Dados - NeuroApp

Este documento descreve as tabelas, variáveis e o fluxo de dados do sistema NeuroApp, utilizando **Prisma ORM** com banco de dados **PostgreSQL**.

## Visão Geral do Modelo (ERD)

O sistema utiliza quatro entidades principais interconectadas para gerenciar a jornada do paciente desde a triagem até o desfecho final.

---

## 1. Tabela: `Patient`
Armazena as informações cadastrais e o status atual do paciente no fluxo de triagem.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | String (CUID) | Identificador único universal do paciente. |
| `name` | String | Nome completo do paciente. |
| `cpf` | String (Único) | Documento de identificação (Chave única). |
| `birthDate` | DateTime | Data de nascimento do paciente. |
| `examDate` | DateTime | Data em que o exame foi realizado. |
| `location` | String | Unidade ou localidade onde o exame foi feito. |
| `technicianName`| String | Nome do técnico responsável pela captura. |
| `gender` | String? | Gênero biológico (Sociodemográfico). |
| `ethnicity` | String? | Raça/Cor autodeclarada (Sociodemográfico). |
| `education` | String? | Grau de escolaridade (Sociodemográfico). |
| `occupation` | String? | Profissão/Ocupação atual (Sociodemográfico). |
| `status` | String | Status do fluxo: `pending`, `in_analysis`, `completed`. |
| `createdAt` | DateTime | Data de registro no sistema. |

---

## 2. Tabela: `PatientImage`
Armazena as referências para as imagens capturadas (armazenadas no AWS S3).

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | String (CUID) | Identificador único da imagem. |
| `url` | String | Caminho/Chave do arquivo no Bucket S3. |
| `fileName` | String | Nome original do arquivo enviado. |
| `uploadedAt` | DateTime | Data do upload. |
| `patientId` | String | FK - Relacionamento com a tabela `Patient`. |

---

## 3. Tabela: `MedicalReport`
Contém a análise clínica e validação diagnóstica realizada pelo médico.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | String (CUID) | Identificador único do laudo. |
| `doctorName` | String | Nome do médico analista responsável. |
| `findings` | String (Long Text) | Descrição detalhada dos achados clínicos. |
| `diagnosis` | String | Conclusão diagnóstica final. |
| `recommendations`| String | Recomendações e condutas sugeridas. |
| `diagnosticConditions`| Json | Objeto booleano com condições (Glaucoma, Catarata, etc). |
| `syncedToDrive` | Boolean | Indica se o laudo foi sincronizado com o Google Drive. |
| `driveFileId` | String? | ID do arquivo no Google Drive após a sincronização. |
| `completedAt` | DateTime | Data de assinatura e finalização do laudo. |
| `patientId` | String (Único)| FK - Relacionamento 1:1 com `Patient`. |

---

## 4. Tabela: `PatientReferral`
Responsável pela rastreabilidade e encaminhamento para a Atenção Especializada.

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | String (CUID) | Identificador único do encaminhamento. |
| `referredBy` | String | Profissional que realizou o encaminhamento. |
| `referralDate` | DateTime | Data em que foi gerada a referência. |
| `specialty` | String | Especialidade de destino (Retina, Glaucoma, etc). |
| `urgency` | String | Nível de prioridade: `routine`, `urgent`, `emergency`. |
| `notes` | String | Observações clínicas adicionais para o especialista. |
| `specializedService` | String?  | Qual serviço de Atenção Especializada recebeu o paciente. |
| `outcome`            | String?  | Desfecho final (Ex: Início de tratamento, Cirurgia). |
| `scheduledDate`      | DateTime? | Data agendada para atendimento na rede especializada. |
| `outcomeDate`        | DateTime? | Data em que o desfecho foi consolidado. |
| `status`             | String   | Fluxo pós-triagem: `pending`, `scheduled`, `outcome_defined`. |
| `patientId`          | String (Único)| FK - Relacionamento 1:1 com `Patient`. |

---

## Fluxo de Dados e Rastreabilidade

1.  **Ingresso**: Técnico cria o `Patient` e múltiplas `PatientImage`.
2.  **Análise**: Médico cria o `MedicalReport` vinculado ao paciente.
3.  **Encaminhamento**: Caso necessário, cria-se o `PatientReferral`.
4.  **Desfecho**: O campo `outcome` em `PatientReferral` garante a rastreabilidade total, fechando o ciclo do paciente na rede de saúde.
