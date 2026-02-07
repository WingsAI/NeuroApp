---
description: Workflow para corrigir problemas de dados no banco
---

# Workflow de Correção de Dados

Este workflow deve ser seguido SEMPRE que houver problemas de integridade no banco.

## Passo 0: BACKUP (OBRIGATÓRIO)

Antes de QUALQUER operação destrutiva:

```powershell
cd e:\GitHub\NeuroApp
node scripts/backup_snapshot.js
```

Isto cria um snapshot em `backups/snapshot_YYYY-MM-DD_HHmmss.json`.

Para restaurar se algo der errado:
```powershell
node scripts/restore_snapshot.js backups/snapshot_XXXX.json            # Preview
node scripts/restore_snapshot.js backups/snapshot_XXXX.json --execute  # Restaurar
```

## Passo 1: Diagnóstico

```powershell
node scripts/diagnose_db.js
```

Verifica: contagens, IDs curtos vs longos, duplicatas por nome, exames sem imagens, pacientes sem exames.

## Passo 2: Limpeza e Correção

```powershell
node scripts/cleanup_and_fix.js              # Preview
node scripts/cleanup_and_fix.js --execute    # Executar
```

O script executa 5 fases:
1. Migra IDs curtos de pacientes para IDs longos (24 chars)
2. Consolida exames duplicados (mantém o com mais imagens/laudos)
3. Remove exames vazios (sem imagens E sem laudo)
4. Normaliza eyerCloudIds curtos para longos
5. Verificação final

## Passo 3: Verificação

```powershell
node scripts/diagnose_db.js
```

Critérios de sucesso:
- 0 pacientes com ID curto (8 chars)
- 0 duplicatas por nome
- 0 exames sem imagens (exceto os protegidos por laudo)
- Todos os 186 laudos preservados

## Regras de Segurança

- **NUNCA** deletar exames com MedicalReport
- **NUNCA** deletar pacientes com laudos
- **SEMPRE** fazer backup antes
- **SEMPRE** rodar preview antes de execute
- Transações Prisma devem ter timeout >= 60s para operações com muitas imagens

## Discrepância de Contagem (DB vs Site)

O site pode mostrar mais pacientes que o banco porque a página medical (`app/medical/page.tsx`) faz merge de:
- Pacientes do banco (via `getPatientsAction()`)
- Pacientes "virtuais" do cloud mapping (via `getCloudMappingAction()`) que ainda não foram sincronizados

Pacientes virtuais têm `cpf: 'PENDENTE'` e são sincronizados automaticamente ao serem acessados.
