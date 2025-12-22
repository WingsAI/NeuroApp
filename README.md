# NeuroApp - Sistema de Neuroftalmologia

Plataforma web para gestão de imagens e laudos médicos neuroftalmológicos, desenvolvida com Next.js 14 e TypeScript.

## Visão Geral

NeuroApp é uma solução completa para conectar técnicos em radiologia e médicos especializados através de um fluxo digital de trabalho. O sistema permite:

- **Registro de Pacientes**: Técnicos podem registrar pacientes e fazer upload de imagens
- **Analytics**: Dashboard com métricas e indicadores em tempo real
- **Fila de Laudos**: Médicos podem selecionar pacientes e elaborar laudos
- **Rastreabilidade**: Fluxo completo desde a triagem até o desfecho na Atenção Especializada
- **Documentação de Dados**: [Guia de Banco de Dados e Variáveis](./DATABASE_GUIDE.md)

## Tecnologias Utilizadas

- **Next.js 14**: Framework React com App Router
- **TypeScript**: Tipagem estática para maior segurança
- **Tailwind CSS**: Estilização moderna e responsiva
- **Prisma ORM**: Gerenciamento de banco de dados
- **PostgreSQL**: Armazenamento persistente de dados
- **AWS S3**: Armazenamento de imagens médicas
- **Lucide React**: Ícones otimizados

## Estrutura do Projeto

```
NeuroApp/
├── app/
│   ├── page.tsx              # Tela 1: Registro de Paciente
│   ├── analytics/
│   │   └── page.tsx          # Tela 2: Dashboard de Analytics
│   ├── medical/
│   │   └── page.tsx          # Tela 3: Fila de Laudos
│   ├── results/
│   │   └── page.tsx          # Tela 4: Visualização de Resultados
│   ├── layout.tsx            # Layout principal
│   └── globals.css           # Estilos globais
├── components/
│   └── Navbar.tsx            # Componente de navegação
├── lib/
│   └── storage.ts            # Funções de armazenamento
├── types/
│   └── index.ts              # Definições de tipos TypeScript
└── public/                   # Arquivos estáticos
```

## Funcionalidades por Tela

### Tela 1: Registro de Paciente (Técnico em Radiologia)

- Formulário de cadastro com validação
- Upload de exatamente 3 imagens (drag-and-drop)
- Preview das imagens antes do envio
- Checkbox de confirmação obrigatório
- Salvamento em LocalStorage

**Campos:**
- Nome completo
- CPF
- Data de nascimento
- Data do exame
- Local do exame
- Nome do técnico

### Tela 2: Dashboard de Analytics

- Total de pacientes registrados
- Total de imagens enviadas
- Laudos pendentes
- Laudos concluídos
- Pacientes e imagens do dia
- Tempo médio de processamento
- Atividade recente
- Gráficos de distribuição

### Tela 3: Fila de Laudos (Médico)

- Lista de pacientes aguardando análise
- Busca por nome, CPF ou local
- Visualização de dados do paciente
- Preview das 3 imagens neuroftalmológicas
- Formulário de elaboração de laudo
- Campos: achados clínicos, diagnóstico e recomendações

### Tela 4: Visualização de Resultados

- Lista de laudos concluídos
- Busca avançada
- Visualização completa do laudo
- Informações do paciente e médico
- Data e local do exame
- Função de impressão

## Como Executar

### Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn

### Instalação

1. Clone o repositório:
```bash
git clone <seu-repositorio>
cd NeuroApp
```

2. Instale as dependências:
```bash
npm install
```

3. Execute o servidor de desenvolvimento:
```bash
npm run dev
```

4. Abra o navegador em [http://localhost:3000](http://localhost:3000)

### Comandos Disponíveis

```bash
npm run dev      # Inicia o servidor de desenvolvimento
npm run build    # Cria build de produção
npm start        # Inicia o servidor de produção
npm run lint     # Executa o linter
```

## Deploy na Vercel

### Passo a passo:

1. Faça push do código para o GitHub

2. Acesse [vercel.com](https://vercel.com)

3. Importe o repositório

4. Configure o projeto (Next.js será detectado automaticamente)

5. Clique em "Deploy"

### Variáveis de Ambiente (Futuro)

Quando integrar com S3, adicione no Vercel:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-1
```

## Próximos Passos (Produção)

### Integração com AWS S3

Atualmente, as imagens são salvas no LocalStorage do navegador. Para produção:

1. Configurar bucket S3 na AWS
2. Implementar upload para S3 no componente de registro
3. Armazenar apenas URLs das imagens no banco de dados
4. Adicionar autenticação para acesso às imagens

### Banco de Dados

Migrar de LocalStorage para banco de dados real:

- **Opções**: PostgreSQL, MongoDB, Supabase
- **ORM**: Prisma ou Drizzle
- Implementar API routes no Next.js
- Adicionar autenticação e autorização

### Autenticação

Implementar sistema de login para diferentes perfis:

- Técnico em Radiologia
- Médico
- Administrador

**Opções**: NextAuth.js, Clerk, Supabase Auth

### Melhorias Futuras

- [ ] Sistema de notificações
- [ ] Exportação de laudos em PDF
- [ ] Upload de imagens DICOM
- [ ] Integração com PACS
- [ ] Assinatura digital de laudos
- [ ] Histórico de edições
- [ ] Relatórios estatísticos avançados
- [ ] Backup automático de dados

## Design e UX

O design foi inspirado em plataformas médicas modernas, com foco em:

- Interface limpa e profissional
- Navegação intuitiva
- Responsividade total (mobile, tablet, desktop)
- Feedback visual claro
- Acessibilidade

## Segurança

### Considerações Importantes

- Dados sensíveis (CPF, informações médicas)
- Conformidade com LGPD
- Criptografia de dados em trânsito e repouso
- Controle de acesso baseado em funções (RBAC)
- Logs de auditoria

### Para Produção

- Implementar HTTPS
- Validação de entrada no servidor
- Rate limiting
- Proteção contra XSS e CSRF
- Backup regular de dados

## Suporte e Contato

Para dúvidas ou suporte, entre em contato:

- **Email**: [seu@email.com]
- **Telefone**: [seu telefone]

## Licença

© 2025 NeuroApp. Todos os direitos reservados.

---

**Desenvolvido por**: João Victor
**Versão**: 1.0.0
**Data**: Novembro 2025
