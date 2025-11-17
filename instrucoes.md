Preciso que voce analise o site a seguir para inspiração de design e use o claude skills frontend-design para melhoria de estilo: https://protocolomedicina.vercel.app/

<contexto>
Meu cliente me encomendou um webapp para tema de neuroftalmologia.
Nele precisaremos de 4 telas.
Na primeira o tecnico em radiologia inserirá os dados de um paciente que estará presencialmente na UPA. E fará o upload de 3 imagens deste paciente. Essas imagens devem ser enviadas para um bucket S3. Por enquanto para demonstracao elas serao salvas no storage do navegador.

</contexto>

<objetivo1>
Montar uma proposta comercial para apresentar ao meu cliente conforme o exemplo de proposta comercial que lhe forneci. Use markdown.
</objetivo1>

<objetivo2>
Montar um webapp next, typescript para eu subir no vercel.
</objetivo2>

<exemplo de proposta comercial>
Operalog - Outubro 2025
Consultoria em Automação Financeira
WingsAI - Soluções Inteligentes para Operações Logísticas
 Cliente: Operalog
 Preparado por: João Victor e Eduardo Silva
 Data: Outubro 2025
 Validade: 30 dias
1. APRESENTAÇÃO
A WingsAI possui uma AI House especializada em transformação digital e automação de processos financeiros. Nossa proposta visa resolver os desafios críticos de gestão de recebíveis da Operalog através de uma solução inteligente baseada em agentes autônomos e automação de workflows.
2. CONTEXTO E DESAFIOS IDENTIFICADOS
2.1 Situação Atual
A Operalog enfrenta desafios na gestão de seu contas a receber, com impacto direto no fluxo de caixa e eficiência operacional:
Volume Operacional:
200 documentos processados diariamente
Potencial de 15.000 títulos ativos simultaneamente (clientes com prazo de 90 dias)
Faturamento de aproximadamente R$ 10 milhões.
13 filiais operacionais
Impactos Financeiros Críticos:
Taxa de inadimplência aproximada de 0,05%
R$ 50.000 em custos operacionais a cada R$ 10 milhões faturados (0,5% do faturamento)
Descasamento entre prazo de faturamento (90 dias) e necessidades de pagamento (30-45 dias)
Complexidade Operacional:
Fragmentação entre múltiplos sistemas (SIMP, NDD, Impetus, CFAS)
Processos manuais intensivos de atualização e conciliação
Perda de documentos no fluxo operacional devido ao alto volume
Falta de visibilidade em tempo real sobre status dos títulos
Identificação reativa de problemas no processo de aprovação
Gestão descentralizada entre 13 filiais
2.2 Fluxo Crítico Nacional Gás
Com 80% do faturamento concentrado na Nacional Gás, o fluxo operacional envolve múltiplas etapas e stakeholders:
Etapas do Processo:
Faturamento no SIMP (ERP Operalog)
Pendente NDD (portal Nacional Gás)
Aprovação em 6 filiais Nacional Gás (Belém, Betim, Canoas, Guamaré, Recife, Camaçari)
Validação Central Fortaleza (Túlio, Luís, controladoria)
Processamento Impetus (antecipação)
Recebimento efetivo
Tempo Ideal: 4-7 dias úteis
Realidade: Gargalos frequentes e falta de visibilidade sobre onde os documentos estão travados
3. SOLUÇÃO PROPOSTA: SISTEMA AGÊNTICO DE GESTÃO DE RECEBÍVEIS
3.1 Conceito da Solução
Implementação de um Sistema Inteligente Baseado em Agentes Autônomos que monitora continuamente o fluxo de recebíveis, identifica anomalias, toma ações proativas e alerta os responsáveis no momento certo.
3.2 Arquitetura da Solução
CAMADA 1: COLETA E INTEGRAÇÃO DE DADOS
Conector SIMP: Integração com download consolidado de faturas em lote (aproveitando RPA existente desenvolvido por Guilherme)
Monitor NDD: Leitura automatizada dos status no portal Nacional Gás (Status 1, 2, 3, etc.)
Integração Impetus: Acompanhamento de títulos em processo de antecipação
Data Lake Centralizado: Armazenamento histórico completo para análises e auditorias
CAMADA 2: INTELIGÊNCIA E PROCESSAMENTO
Agente de Monitoramento Contínuo: Leitura diária de todos os títulos faturados e não pagos
Agente de Análise de Status: Comparação entre status atual e status esperado baseado em prazos
Agente de Detecção de Anomalias: Identificação de títulos "perdidos" ou travados no fluxo
Motor de Regras de Negócio: Validações automáticas e triggers para ações
Sistema de Priorização: Classificação de urgência baseada em valor, prazo e histórico
CAMADA 3: AÇÃO E COMUNICAÇÃO
Workflow Agêntico: Execução automática de ações baseadas em regras inteligentes
Sistema de Alertas Inteligentes: Notificações direcionadas para responsáveis específicos
Solicitação Automática de XML: Verificação de disponibilidade de título antes de solicitar upload
Gestão de Escalação: Encaminhamento automático quando prazos críticos são ultrapassados
Central de Comunicação: Hub unificado para todas as interações do sistema
CAMADA 4: VISUALIZAÇÃO E CONTROLE
Dashboard Executivo: KPIs estratégicos e visão consolidada
Dashboard Operacional: Controle detalhado para equipe financeira
Painel de Performance: Métricas de recebimento e eficiência por cliente/filial
Relatórios Automáticos: Análises periódicas sem intervenção manual
3.3 Módulos Funcionais - Piloto (45 dias)
MÓDULO 1: MONITOR INTELIGENTE DE STATUS
Funcionalidades:
Leitura diária automatizada de todos os títulos faturados
Mapeamento de status atual em cada sistema (SIMP, NDD, Impetus)
Comparação com linha do tempo esperada baseada em data de emissão
Identificação de títulos fora do status esperado (ex: está no Status 1 mas deveria estar no Status 3)
Dashboard visual com semáforo de situação (verde/amarelo/vermelho)
Benefícios:
Visibilidade imediata de 100% dos títulos em fluxo
Identificação proativa de problemas antes de impactar o fluxo de caixa
Eliminação de documentos "perdidos" no processo
MÓDULO 2: AGENTE DE AÇÃO PROATIVA
Funcionalidades:
Verificação automática de disponibilidade de título no sistema cliente
Solicitação inteligente de upload de XML (apenas quando título está disponível)
Comunicação automática com responsáveis por aprovação nas filiais
Alertas escalonados conforme nível de urgência (48h, 72h, 96h de atraso)
Registro automático de todas as ações tomadas
Benefícios:
Redução de 80% no tempo de identificação de problemas
Comunicação no momento certo, com contexto relevante
Histórico completo de ações para auditoria
MÓDULO 3: GESTÃO DE ALTO VOLUME
Funcionalidades:
Processamento automático de 200+ documentos diários
Capacidade de gerenciar até 15.000 títulos simultâneos
Priorização inteligente baseada em valor e urgência
Detecção automática de padrões em documentos problemáticos
Fila organizada de pendências por responsável
Benefícios:
Zero documentos perdidos no volume operacional
Foco da equipe nos casos que realmente precisam de atenção
Escalabilidade para crescimento futuro
MÓDULO 4: DASHBOARD OPERACIONAL E ANALYTICS BÁSICO
Funcionalidades:
KPI de contas a receber (objetivo: manter abaixo de 9,5)
Visualização em tempo real de status por filial
Relatórios diários de pendências e gargalos
Histórico de evolução de títulos
Métricas de tempo médio por etapa do processo
Benefícios:
Visibilidade total do processo de recebimento
Identificação rápida de gargalos
Base para tomada de decisão informada
4. ESTRATÉGIA DE IMPLEMENTAÇÃO - PILOTO 45 DIAS
4.1 Escopo do Piloto (45 dias)
Objetivo: Entregar um sistema funcional focado em Nacional Gás que demonstre valor imediato e prepare o terreno para expansões futuras.
Entregas Garantidas:
Integração completa com SIMP (aproveitando RPA do Guilherme)
Monitor automatizado de status NDD (Status 1, 2, 3, etc.)
Dashboard operacional para equipe financeira
Agente de alertas para pendências críticas
Workflow automático para solicitação de XML
Sistema de notificações para responsáveis
Gestão de 200 documentos diários
Suporte às 1 filial Nacional Gás
Resultado Esperado em 45 dias:
100% de visibilidade dos títulos em fluxo
70% de redução no tempo de identificação de problemas
80% de redução no tempo manual da equipe financeira
Sistema operando de forma autônoma
4.2 Cronograma Detalhado - 45 Dias
SEMANA 1-2: DISCOVERY E FOUNDATION
Workshop técnico com equipe Operalog
Mapeamento detalhado do fluxo atual
Acesso aos sistemas e validação com RPA do Guilherme
Setup da infraestrutura de dados e arquitetura
SEMANA 3-4: DESENVOLVIMENTO CORE
Integração com SIMP e coleta de dados
Desenvolvimento do monitor de status NDD
Criação do dashboard operacional
Testes iniciais com dados reais
SEMANA 5-6: AUTOMAÇÃO E WORKFLOWS
Implementação dos workflows agênticos
Sistema de alertas e comunicação
Agente de solicitação de XML
Testes integrados em ambiente controlado
SEMANA 7 (FINAL): GO-LIVE E ESTABILIZAÇÃO
Treinamento intensivo da equipe
Documentação completa do sistema
Go-live em operação paralela
Entrega oficial e início da operação plena
4.3 Marcos de Validação
Marco 1 - Dia 24 (Final Semana 4):
Sistema coletando dados automaticamente do SIMP
Dashboard exibindo status em tempo real
Primeira validação técnica completa
Marco 2 - Dia 38 (Final Semana 6):
Todos os workflows agênticos funcionando
Sistema de alertas operacional
Testes integrados concluídos com sucesso
Marco 3 - Dia 45 (Entrega Final):
Go-live em produção
Equipe treinada e operando o sistema
Documentação completa entregue

5. BENEFÍCIOS - PILOTO 45 DIAS
5.1 Redução de Custos Operacionais
Economia de Tempo da Equipe:
80% de redução no tempo de atualização manual (Lana)
70% de redução no tempo de acompanhamento de pendências
Liberação da equipe para atividades estratégicas
Eliminação de Erros:
Zero documentos perdidos no volume diário
Eliminação de erros de digitação e transcrição
Conciliações automáticas e confiáveis
5.2 Melhoria do Fluxo de Caixa
Otimização do Ciclo de Recebimento:
Redução de 3-5 dias no tempo médio de identificação de problemas
Ação proativa antes de gargalos impactarem o fluxo
Visibilidade total para negociações de antecipação
Visibilidade e Controle:
100% dos títulos monitorados em tempo real
Previsão precisa de recebimentos futuros
Identificação imediata de gargalos
5.3 Escalabilidade e Crescimento
Capacidade Operacional:
Processamento ilimitado de documentos (vs. limite manual atual)
Suporte a 15.000+ títulos simultâneos sem degradação
Preparação para novos clientes sem custos operacionais adicionais

6. INVESTIMENTO E MODELO COMERCIAL
6.1 Estrutura de Cobrança - PILOTO 45 DIAS
Setup e Desenvolvimento - Piloto Completo
Valor: R$ 59.000 (parcela única)
Inclui: Discovery, desenvolvimento completo, integração, testes, treinamento e go-live
Prazo: 45 dias garantidos
Entrega: Sistema funcional 100% operacional
Possíveis extensões e serviços adicionais
Expansão para outras filiais: Integração e configuração para as outras filiais, escalando o sistema para toda a empresa
Valor estimado: a partir de R$ 30.000,00
6.2 Condições Comerciais
Forma de Pagamento - Piloto:
Setup: 50% na assinatura (início imediato), 50% no dia 30
Pagamento via boleto ou PIX
Garantias:
Entrega em 45 dias ou reembolso de 20% do setup
30 dias de garantia de funcionamento após go-live
SLA de 99% de uptime do sistema
Suporte técnico em horário comercial (8h-18h)
7. DIFERENCIAIS DA WINGSAI
7.1 Expertise Específico
Especialização em automação financeira para logística
Conhecimento profundo dos sistemas SIMP, NDD e Impetus
Experiência em integração com RPAs existentes (trabalharemos com RPA do Guilherme)
Metodologia ágil com entregas incrementais e rápidas
7.2 Tecnologia de Ponta
Arquitetura baseada em agentes autônomos (cutting-edge)
Escalabilidade cloud-native desde o primeiro dia
APIs abertas para integrações futuras
Desenvolvimento ágil com sprints semanais
7.3 Modelo de Parceria
Suporte dedicado durante toda a implementação
Evolução contínua da plataforma
Transferência de conhecimento para equipe interna
7.4 Garantia de Prazo
Comprometimento contratual com entrega em 45 dias
Equipe dedicada 100% ao projeto
Metodologia de desenvolvimento testada e validada
Penalidade por atraso (reembolso parcial)
8. GESTÃO DE RISCOS
8.1 Riscos Técnicos e Mitigações
Risco	Probabilidade	Impacto	Mitigação
Falha na integração SIMP	Baixa	Alto	Aproveitamento de RPA existente + testes desde semana 1
Mudanças nos sistemas clientes	Média	Médio	Arquitetura adaptável + monitoramento
Performance com alto volume	Baixa	Médio	Arquitetura escalável + testes de carga antecipados
Atraso no cronograma	Baixa	Alto	Equipe dedicada + buffer de tempo + sprints semanais


8.2 Riscos Operacionais e Mitigações
Risco	Probabilidade	Impacto	Mitigação
Resistência da equipe	Média	Médio	Treinamento desde início + demonstração de benefícios
Indisponibilidade de sistemas	Média	Médio	Backup + modo degradado
Dados históricos inconsistentes	Alta	Baixo	Limpeza automática + validações


8.3 Riscos de Cronograma
Risco	Probabilidade	Impacto	Mitigação
Atrasos de 3ª partes	Média	Alto	Início imediato + comunicação clara de dependências
Escopo creep	Média	Médio	Escopo fechado + change control rigoroso
Aprovações demoradas	Baixa	Alto	Processo de aprovação definido no kick-off



9. FATORES CRÍTICOS DE SUCESSO
9.1 Comprometimento da Liderança
✓ Buy-in da diretoria para mudança de processo
 ✓ Definição clara de responsáveis internos
 ✓ Alocação de tempo da equipe para colaboração (especialmente semanas 1-2)
 ✓ Decisões rápidas para manter cronograma de 45 dias
9.2 Qualidade dos Dados e Acessos
✓ Acesso completo aos sistemas na Semana 1 (SIMP, NDD, Impetus)
 ✓ Colaboração do Guilherme com RPA existente
9.3 Gestão da Mudança
✓ Comunicação transparente com a equipe desde o dia 1
 ✓ Treinamento contínuo durante desenvolvimento
 ✓ Celebração de marcos intermediários
 ✓ Feedback constante para ajustes rápidos
9.4 Velocidade de Execução
✓ Início imediato após assinatura (sem "warm-up")
 ✓ Reuniões de alinhamento 2x por semana
 ✓ Decisões em até 24h para não travar cronograma
 ✓ Equipe WingsAI 100% dedicada ao projeto
10. PRÓXIMOS PASSOS
10.1 Imediatos (Esta Semana)
Dia 1-2:
Reunião de apresentação desta proposta (90 minutos)
Esclarecimento de dúvidas técnicas e comerciais
Dia 3-4: 
4. Reunião com Guilherme sobre RPA do SIMP 
5. Validação de acessos aos sistemas 
6. Definição de responsáveis internos
Dia 5: 
7. Assinatura de contrato 
8. Pagamento da primeira parcela 

INÍCIO OFICIAL DO PROJETO (DIA 1 DOS 45)
10.2 Primeira Semana do Projeto
Dias 1-2:
Kick-off técnico (8 horas)
Mapeamento detalhado com time Operalog
Acesso completo aos sistemas
Dias 3-5:
Workshop de processos com equipe
Análise do RPA existente com Guilherme
Definição final de KPIs e métricas de sucesso
10.3 Informações Necessárias para Início
Para dar sequência imediata, precisaremos ter pronto:
Acessos Técnicos:
 Credenciais de leitura do SIMP
 Acesso ao portal NDD
 Documentação dos sistemas
 Repositório do RPA do Guilherme (se aplicável)
Informações de Negócio:
 Lista das 13 filiais e responsáveis
 Processo atual documentado (se existir)
 Planilhas Excel atuais
Recursos Humanos:
 Agenda de disponibilidade: Bruno, Mariana, Guilherme
 Definição de sponsor executivo do projeto
 Ponto focal para decisões rápidas
Infraestrutura:
 Aprovação para hospedagem cloud (se necessário)
 Políticas de segurança da informação
 Requisitos de compliance

11. MODELO DE TRABALHO E COMUNICAÇÃO
11.1 Cerimônias e Reuniões
Semanal (Toda Segunda, 60min):
Status report
Demonstração de progresso
Planejamento da semana
Resolução de bloqueios
Diária (via WhatsApp/Slack):
Update rápido de progresso
Identificação de impedimentos
Alinhamento de prioridades
Marcos (Ao final de cada fase):
Apresentação formal de entrega
Validação e aprovação
Coleta de feedback
11.2 Canais de Comunicação
WhatsApp: Comunicação rápida e urgências
 Slack/Teams: Comunicação estruturada do projeto
 E-mail: Documentação formal e aprovações
 Video-conferência: Reuniões semanais e workshops
 Documentação Online: Notion/Confluence para documentação compartilhada



Estamos prontos para começar. E você?
WingsAI - Transformando Operações com Inteligência
Documento confidencial - Proposta Comercial Operalog - Outubro 2025 - Versão 1.0

	"Rua Henrique Monteiro, 234Faria Lima"	www.wingsgroup.ai	(11) 98767-9758



</exemplo de proposta comercial>