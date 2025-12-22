# Guia de Configuração - NeuroApp 100% Funcional

Este documento explica como configurar as integrações do projeto: Supabase (Auth), AWS S3 (Storage) e Railway (PostgreSQL).

## 1. Banco de Dados (PostgreSQL no Railway)
1. Crie uma conta no [Railway](https://railway.app/).
2. Clique em "New Project" > "Provision PostgreSQL".
3. Nas configurações do banco, copie a "Connection URL".
4. Adicione essa URL ao seu `.env.local` na variável `DATABASE_URL`.
5. No terminal do projeto, rode:
   ```bash
   npx prisma db push
   ```

## 2. Autenticação (Supabase)
1. Crie um projeto no [Supabase](https://supabase.com/).
2. Vá em "Project Settings" > "API".
3. Copie o `Project URL` e a `anon public key`.
4. Adicione ao `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Vá em "Authentication" > "Users" e crie um usuário para teste.

## 3. Armazenamento de Imagens (AWS S3)
1. Crie uma conta no [AWS Console](https://aws.amazon.com/).
2. Procure por **S3** e clique em "Create bucket".
   - Dê um nome único.
   - Desmarque "Block all public access" (ou configure as permissões conforme necessário para URLs assinadas).
3. Vá em **IAM** e crie um novo usuário com "Programmatic access".
4. Anexe a política `AmazonS3FullAccess` a este usuário.
5. Salve as `Access Key ID` e `Secret Access Key`.
6. Configure no `.env.local`:
   - `AWS_REGION`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_S3_BUCKET_NAME`

## 4. Finalização
Com as chaves configuradas, reinicie o servidor de desenvolvimento:
```bash
npm run dev
```

O sistema agora está salvando dados reais no Postgres, imagens no S3 e protegendo as rotas com Supabase Auth.
