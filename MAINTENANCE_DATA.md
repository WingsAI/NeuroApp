# Guia de Manutenção do Modelo de Dados (Patient/Exam)

Este documento explica como manter a integridade dos dados após a refatoração que separou **Pacientes** de **Exames**.

## Estrutura Atual
- **Patient**: Representa a pessoa física (Nome, CPF, Data de Nascimento).
- **Exam**: Representa cada visita ou tentativa de exame. Contém `status`, `location`, `images`, `report` e `referral`.

## Como Evitar Dados "Zerados" no Front-end
Para evitar que componentes legados parem de exibir dados (como status ou laudo), seguimos o padrão de **Promoção do Último Exame**.

Na `app/actions/patients.ts`, a função `getPatientsAction` achata automaticamente os dados do exame mais recente para o nível do objeto `Patient`:

```typescript
// Exemplo do que getPatientsAction retorna para o front-end:
{
  id: "...",
  name: "João Silva",
  // ... outros campos do paciente
  exams: [...], 
  
  // CAMPOS PROMOVIDOS (Retrocompatibilidade)
  status: latestExam.status,
  report: latestExam.report,
  location: latestExam.location,
  // ...
}
```

**Regra de Ouro:** Ao adicionar novos campos ao Modelo `Exam`, se eles precisarem aparecer nas listagens globais de pacientes, adicione-os também na lógica de mapeamento da `getPatientsAction`.

## Prevenção de Duplicatas do EyerCloud
O EyerCloud gera IDs curtos e longos para o mesmo exame.
1. **Sempre use `python scripts/clean_mapping.py`** antes de sincronizar.
2. Isso garante que apenas o registro mais completo de cada paciente seja importado.

## Limpeza de "Registros Fantasma"
Se o banco de dados começar a mostrar números maiores de pacientes ou exames pendentes do que o esperado:
1. Verifique o arquivo `bytescale_mapping_cleaned.json`.
2. Rode `node scripts/real_cleanup_v2.js`.
3. Isso remove qualquer registro que não tenha um laudo associado e que não esteja presente no mapeamento oficial de imagens.

## Build e Tipagem
Se o build falhar após mudanças no banco:
1. Verifique se `lib/mockData.ts` foi atualizado (ele precisa de `exams: []` em todos os objetos).
2. Verifique se as interfaces em `types/index.ts` refletem as mudanças do `prisma/schema.prisma`.
