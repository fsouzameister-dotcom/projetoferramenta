# Backlog de produto — ClientOn

> Fonte viva de itens **fora do escopo 0–30 / 31–60** ou **polish pós go-live**.  
> Escopo ativo e prioridades de release: **[DEVLOG.md → Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

**Última atualização:** 2026-06-08 (Instagram + bug template agente)

---

## Legenda

| Prioridade | Significado |
|------------|-------------|
| **P1** | Logo após núcleo 0–30 (se sobrar capacidade na janela) |
| **P2** | 31–90 dias / polish |
| **P3** | 90d+ ou sob demanda de cliente |
| **—** | Fora do core (não implementar como produto horizontal) |

| Status | Significado |
|--------|-------------|
| 📋 Backlog | Planejado, não iniciado |
| 💬 Discussão | Requisitos em aberto (ver DEVLOG) |
| ❌ Não fazer | Decisão explícita de não perseguir |

---

## Índice de épicos

| P | Épico | Janela | Status | Detalhe |
|---|-------|--------|--------|---------|
| **P1** | [Instagram / Meta — integração](#épico-instagram--meta-integração) | 0–90d | 💬 | DM, Lead Ads nativo, CTWA; ver diagnóstico DEVLOG 2026-06-08 |
| **P1** | [Operação atendimento — fase 2 (pós-MVP filas/tabulações)](#épico-operação-atendimento--fase-2-pós-mvp-filastabulações) | 0–30d | 📋 | Retorno cliente, protocolo/reabertura, UX filas no agente, relatórios encerramento |
| **P1** | [Campanhas — fase 2 (produto bulk)](#épico-campanhas--fase-2-produto-bulk) | pós-piloto | 📋 | Agendamento, header Meta, cadastro mestre, throttle distribuído |
| P2 | [Tutoriais interativos in-app (product tours)](#épico-tutoriais-interativos-in-app) | 61–90d | 📋 | Driver.js / Joyride; tours por role |
| P2 | [Checklist configuração mínima do tenant](#épico-checklist-configuração-mínima-do-tenant) | 61–90d | 📋 | Onboarding self-service (% WhatsApp, fluxo, agente) |
| P2 | [NPS / CSAT pós-interação](#épico-nps--csat-pós-interação) | 61–90d | 📋 | Node ou pesquisa pós-fluxo; correlacionar relatórios |
| P2 | [Cadastro mestre API consolidada](#épico-cadastro-mestre-api-consolidada) | 61–90d | 📋 | Endpoint único cliente + telefones e visão unificada para UI |
| P2 | [Glossário de erros de envio WhatsApp](#épico-glossário-de-erros-de-envio-whatsapp) | 61–90d | 📋 | Código Meta/Twilio → significado + ação sugerida na Central do Agente e FAQ |
| P2 | [Uso de IA — painel e custo estimado](#épico-uso-de-ia--painel-e-custo-estimado) | 31–60d | 📋 | Tokens, chamadas e custo por tenant/fluxo; dados de `ai_usage_logs` |
| P2 | [Alerta — inbound processado sem envio (bot pausado)](#épico-alerta--inbound-processado-sem-envio-bot-pausado) | 31–60d | 📋 | Visibilidade no monitoramento quando safeguard bloqueia resposta |
| P2 | Telefonia embarcada (protótipo) | 31–60d+ | 💬 | [DEVLOG — Discussão telefonia](DEVLOG.md#discussão-telefonia--a-retomar-2026-05-22) |
| P3 | Centro de ajuda in-app (links + vídeos) | 90d+ | 📋 | Complemento aos product tours |
| P3 | Tours contextuais por node / feature | 90d+ | 📋 | Após tours MVP |
| P3 | Orquestração preditiva (ML) | 90d+ | ❌ | Ver [Benchmark omnichannel](DEVLOG.md#benchmark-omnichannel-2026--matriz-clienton) |
| P3 | Sentiment journey score + alerta supervisor | 90d+ | 📋 | Após insights LLM |
| — | Unified commerce / POS / OMS | — | ❌ | Integrar via `chamada_api` por tenant |
| — | Identity graph / CDP enterprise | — | ❌ | |
| — | IoT field service proativo | — | ❌ | |
| — | RCS / SMS | — | ❌ SMS fora de escopo |

---

## Épico: Instagram / Meta — integração

**Contexto:** sessão 2026-06-08 — diagnóstico completo do que existe vs o que falta para conectar ClientOn ao Instagram. Ver [DEVLOG — checkpoint 2026-06-08](DEVLOG.md#checkpoint-de-sessão-2026-06-08--campanhas-instagram-e-bugs).

**Estado hoje:** **não há Instagram DM**. Existe apenas captação de `@usuario` em fluxos (Fox), opção cosmética `flows.channel = instagram`, e tipo inbound `instagram_lead` (Lead Ads via POST manual em `/webhooks/inbound`). Infra Meta reutilizável (~70%): Graph API, webhook verify, assinatura, segredos, orchestrator, inbox — tudo implementado para **WhatsApp Cloud API**.

### Três caminhos (escopos distintos)

| Caminho | O que é | Escopo estimado | Prioridade sugerida |
|---------|---------|-----------------|---------------------|
| **A — Lead Ads + CTWA** | Captação via anúncio FB/IG (nome/telefone → fluxo WA) | 1–2 semanas | Alinhado ao DEVLOG 0–30d (já comprometido) |
| **B — Instagram DM** | Inbox + bot/agente respondendo pelo Direct | 4–6 semanas | Médio prazo |
| **C — Omnichannel** | A + B + inbox unificado com badge de canal | 6–8 semanas | Após MVP B |

### Gaps técnicos (Instagram DM)

| # | Item | Notas |
|---|------|--------|
| 1 | Webhook Page (`object: "page"`) | Hoje `parseWhatsAppWebhookPayload` só aceita `whatsapp_business_account` |
| 2 | Canal IG por tenant | `page_id`, `instagram_business_account_id`, Page token cifrado |
| 3 | `source_type` `instagram_dm` | Novo tipo em `inbound_entry_routes` + UI Entrada |
| 4 | Identidade IGSID | `agent_conversations.phone NOT NULL` — IG usa IGSID, não E.164 |
| 5 | Outbound IG | `deliverOutboundIfWhatsApp` → ramificar por canal |
| 6 | UI admin | Aba/canal Meta além de `/admin/whatsapp` |
| 7 | Lead Ads nativo | Webhook field `leadgen` na Page |
| 8 | CTWA | Parse `referral` no webhook WhatsApp existente |

### Pré-requisitos Meta (lado cliente)

- Instagram Business/Creator vinculado a Facebook Page  
- Meta App com `instagram_manage_messages`, `pages_messaging` (App Review)  
- Webhook na Page: fields `messages`, `messaging_postbacks`  
- Page Access Token long-lived por tenant  

### Decisões em aberto

1. Escopo primeiro: Lead Ads/CTWA vs Instagram DM vs ambos em sequência  
2. Inbox unificado vs canal separado na UI  
3. Aceitar Messenger no mesmo webhook Page ou só IG no MVP  
4. Um app Meta por plataforma vs por tenant  

---

## Épico: Campanhas — fase 2 (produto bulk)

**Contexto:** MVP de campanhas entregue (disparo template, throttle, inbound por campanha, relatório, controles P1: pausa/retry/destinatários/recovery). Piloto Cleo validado em produção (2026-06-08).

| # | Item | Prioridade |
|---|------|------------|
| 1 | Agendamento (`scheduled_at`) | P2 |
| 2 | Variáveis de header Meta | P2 |
| 3 | Vínculo `client_id` na importação | P2 |
| 4 | Migration formal colunas tracking | P2 |
| 5 | Throttle distribuído (Redis) | P2 |

---

## Épico: Operação atendimento — fase 2 (pós-MVP filas/tabulações)

**Contexto:** sessão 2026-05-28 entregou admin Operação (`/admin/operations`), filas, tabulações × filas, protocolo `CLI-*`, encerramento obrigatório no agente e fix de resolução de fila (`6af1c28`). Ver [DEVLOG — checkpoint 2026-05-28](DEVLOG.md#checkpoint-de-sessão-2026-05-28--operação-filas-tabulações-encerramento).

**Problema:** operação básica funciona, mas faltam fluxos de retorno do cliente, relatórios de encerramento e polish no painel do agente.

### Itens (ordem sugerida)

| # | Item | Notas |
|---|------|--------|
| 1 | **Pré-carga inbound — continuar vs nova solicitação** | Usar `returnLookupDays` (já em `tenant_service_settings`); se cliente voltar dentro da janela, oferecer retomar atendimento ou abrir nova solicitação |
| 2 | **Reabertura com mesmo protocolo** | Manter `CLI-*` na continuação; registrar eventos internos de reabertura (ticket/histórico) para auditoria |
| 3 | **Retorno ao bot após encerramento humano** | Após encerramento pelo agente, mensagens do cliente reentram no fluxo automatizado (estado da conversa + handoff reverso) |
| 4 | **Dropdown de filas no agente** | Substituir campo texto livre em “Novo contato” por `GET /queues` (chave + rótulo); alinhar com `resolveConversationQueueKey` |
| 5 | **`closure_message_status` em relatórios** | Quando encerramento não envia WhatsApp (fora da 24h), persistir status e expor em `/reports` ou export |
| 6 | **Onboarding Operação ao criar fila** | Aviso/checklist: vincular tabulações à nova fila em Operação → Tabulações (ou deixar tabulação global) |
| 7 | **Resumo por tabulação (sem nome do atendente)** | Relatórios/insights de encerramento agregados por tabulação, não por agente, conforme decisão de produto |
| 8 | **Polish modal encerramento** | Revisar contraste do botão “Confirmar encerramento” em tema escuro após deploy |

### Critério de pronto (MVP fase 2)

- Cliente que retorna em até N dias vê fluxo claro (continuar / nova solicitação).
- Encerramento fora da 24h não falha silenciosamente — status visível para supervisor.
- Agente sempre escolhe fila válida ao criar contato; tabulações corretas por fila sem depender só de fallback.

### Dependências

- Deploy em produção do pacote `70fa8d2` … `6af1c28`.
- Inbound WhatsApp → `executeFlow` (épico separado no DEVLOG) para item 3 fazer sentido ponta a ponta.

**Não bloqueia:** uso atual de filas “Geral”, tabulações vinculadas e encerramento com tabulação após deploy.

---

## Épico: Tutoriais interativos in-app

**Problema:** onboarding depende de CS; cada tenant novo repete as mesmas dúvidas.

**Solução:** tours no produto (destaque, passos, pular/concluir, não repetir).

**Stack sugerida:** Driver.js ou React Joyride + `data-tour` + roteiros JSON por **role**.

### Tours MVP (fase 1)

| # | Tour | Público |
|---|------|---------|
| 1 | Primeiro acesso — Clientes, abrir tenant, Fluxos | `platform_admin` |
| 2 | Editor de fluxo — paleta, salvar, Voltar, Receber Mensagem / timeout | `admin_local`, `supervisor` |
| 3 | Painel agente — fila, resposta, template (janela 24h) | `agente`, supervisores |

### Fase 2

- Tour WhatsApp admin (Meta + Twilio)  
- Checklist configuração mínima do tenant (pode ser épico separado)  
- Tours por vertical (`pesquisa` vs `vendas`)

### Fase 3

- Tour contextual ao adicionar node  
- `tour_completed` no backend (métrica de adoção)

### Critério de pronto (MVP)

- Botão **?** reabre ajuda  
- 3 tours sem quebra de seletor  
- Tours distintos por role  

### Fora do v1

- Editor no-code de tours (Appcues, Pendo, etc.) — reavaliar com LGPD/escala  

**Não bloqueia:** WhatsApp, cadastro mestre, inbound → fluxo.

---

## Épico: Checklist configuração mínima do tenant

**Problema:** tenant novo não sabe se está “pronto” para operar.

**Solução:** widget na sidebar ou dashboard: canal WhatsApp configurado, fluxo ativo, usuário agente, template aprovado — % concluído.

**Relacionado:** product tours (tour 1 pode apontar para o checklist).

---

## Épico: NPS / CSAT pós-interação

**Problema:** benchmark CX (Medallia, Qualtrics) — medir satisfação após atendimento.

**Solução:** node ou mensagem final de pesquisa NPS; evento em `flow_response_events` ou tabela dedicada; agregado em `/reports` ou insights.

**Dependência:** cadastro mestre + fluxo ponta a ponta estável.

---

## Épico: Cadastro mestre API consolidada

**Problema:** frontend precisa de múltiplas chamadas para montar perfil completo do cliente (dados básicos + telefones), aumentando acoplamento e latência.

**Solução:** criar endpoint consolidado `GET /api/clients/:id` retornando cliente + telefones em payload único, mantendo CRUD atual para escrita.

**Escopo inicial sugerido:**

- `GET /api/clients/:id` (cliente + `phones[]`)
- contrato estável para telas de atendimento e CRM
- preparo para incluir canais adicionais (email, social ids) no mesmo envelope

**Dependência:** CRUD mínimo de `clients` e `client_phones` (já entregue).

---

## Épico: Glossário de erros de envio WhatsApp

**Problema:** quando uma mensagem falha, o agente vê código técnico (ex.: `63051`) e descrição da API, mas não um guia operacional claro.

**Solução:** glossário central por `error_code` (Meta Cloud API + Twilio), exibido na bolha de falha da Central do Agente e seção pesquisável no FAQ.

**Escopo MVP sugerido:**

- Mapa código → título amigável, explicação, ação sugerida (~15–20 códigos frequentes)
- Fallback para códigos desconhecidos (manter `error_description` técnica)
- `GET /api/agent/delivery-errors/glossary` (opcional) ou resolução no backend ao listar mensagens
- Entrada no FAQ: “Erros de envio WhatsApp”

**Contexto:** envio de texto do agente já persiste `failed` + código; templates passaram a usar API real (commit `bf9c435`). Glossário complementa ambos os fluxos.

**Não bloqueia:** operação atual; melhoria de UX/suporte.

---

## Épico: Uso de IA — painel e custo estimado

**Contexto:** sessão 2026-06-05 — fluxo Cleo em produção com OpenAI (`gpt-4o-mini`). Cada turno de **Conversa (IA)** pode gerar **duas chamadas** (resolver transição + gerar resposta). O backend já persiste uso em `ai_usage_logs` (`provider`, `model`, `request_tokens`, `response_tokens`, `latency_ms`, `persona_id`, `conversation_id`, `status`). O painel da OpenAI do tenant pode mostrar **$0,00** quando a chave API pertence a outra organização ou quando o gasto com `gpt-4o-mini` é de centavos de dólar.

**Problema:** administrador não vê consumo de IA dentro do ClientOn; depende do dashboard externo (OpenAI/Gemini), que pode não refletir a chave cadastrada ou arredondar valores baixos.

**Solução:** tela em Admin (ex.: **Uso de IA** ou aba em Monitoramento) com visão operacional e financeira estimada, sem substituir a fatura do provedor.

### Escopo MVP sugerido

| # | Item | Notas |
|---|------|--------|
| 1 | **Resumo por período** | Filtros 24h / 7d / 30d; totais de chamadas, tokens entrada/saída, latência média |
| 2 | **Quebra por provedor e modelo** | OpenAI vs Gemini; modelo configurado em `ai_provider_settings` |
| 3 | **Custo estimado** | Tabela de preços por modelo (configurável ou constante documentada); exibir USD e opcional BRL |
| 4 | **Quebra por fluxo / persona** | Join com `conversation_id` → fluxo ativo; agregar por `persona_id` |
| 5 | **Lista de chamadas recentes** | Últimas N entradas de `ai_usage_logs` com status success/error |
| 6 | **Aviso de chave × org** | Texto de ajuda: gasto pode não aparecer no painel OpenAI se a API key for de outra conta |

### API sugerida

- `GET /api/admin/ai-usage/summary?from=&to=` — agregados
- `GET /api/admin/ai-usage/recent?limit=` — linhas recentes
- Permissão: `admin_local` / `platform_admin` (tenant-scoped)

### Critério de pronto (MVP)

- Admin vê tokens e custo estimado do tenant sem consultar OpenAI.
- Dados batem com amostra manual em `ai_usage_logs` (tolerância de arredondamento de custo).
- Documentação curta no FAQ ou tooltip sobre diferença vs fatura do provedor.

### Dependências

- `ai_usage_logs` e provedor ativo por tenant (já existem).
- Fluxos com node **Conversa (IA)** em uso (Cleo e demais).

**Não bloqueia:** operação atual da Cleo nem cadastro de provedor em Admin → IA.

---

## Épico: Alerta — inbound processado sem envio (bot pausado)

**Contexto:** sessão 2026-06-05 — após rajada de mensagens do fluxo Cleo, o bot foi **pausado manualmente** (`bot_outbound_paused`, Dashboard / WhatsApp Admin). O lead Raphael enviou *"Quero saber sobre preço"* às 14:01 UTC: a mensagem apareceu no monitoramento e a IA executou (2 chamadas em `ai_usage_logs`), mas **nenhum texto foi enviado** ao WhatsApp porque `checkAndRecordBotOutbound` retornou `BOT_PAUSED`. Do ponto de vista do cliente, o atendimento “parou”.

**Problema:** não há sinalização clara de que o fluxo rodou e falhou só na entrega; o admin precisa inferir pelo painel de salvaguarda ou logs do servidor.

**Solução:** tornar explícito no produto quando inbound foi roteado e houve resposta gerada, porém **zero outbound** por pausa, dedup ou circuit breaker.

### Escopo MVP sugerido

| # | Item | Notas |
|---|------|--------|
| 1 | **Log estruturado** | Em `deliverOutboundIfWhatsApp`, quando todas as mensagens forem bloqueadas, registrar `inbound_outbound_blocked` com `code` (`BOT_PAUSED`, `DUPLICATE_CONTENT`, `CIRCUIT_BREAKER`) |
| 2 | **Evento em conversa** | Gravar mensagem interna ou metadata na conversa (ex.: *"Bot não enviou: pausado pelo administrador"*) visível no monitoramento / Central do Agente |
| 3 | **Badge no monitoramento** | Na listagem de conversas, indicador quando último inbound não teve resposta do bot por salvaguarda |
| 4 | **Banner persistente** | Enquanto `bot_outbound_paused = true`, destaque no Dashboard e WhatsApp Admin (já existe painel; reforçar impacto: *"Leads não recebem resposta automática"*) |
| 5 | **Métrica opcional** | Contador diário `inbound_blocked_outbound` por tenant para relatório ops |

### Critério de pronto (MVP)

- Admin identifica em até 1 tela por que o cliente não recebeu resposta após falar com o bot.
- Caso bot pausado: texto de ajuda com link/ação para reativar.
- Não registrar como falha de entrega Twilio/Meta quando o bloqueio foi interno (código `BOT_PAUSED`).

### Dependências

- Salvaguarda do bot (`bot-outbound-safeguard.ts`, `BotSafeguardPanel`) — já existem.
- Monitoramento de conversas — UI em evolução.

**Não bloqueia:** operação atual; melhoria de observabilidade pós-incidente Cleo/Raphael.

---

## Como adicionar itens

1. Incluir linha na tabela **Índice de épicos** acima.  
2. Se o épico for grande, adicionar seção `## Épico: …` neste arquivo.  
3. Atualizar **[Backlog — roadmap (produto)](DEVLOG.md#backlog--roadmap-produto)** no DEVLOG se mudar prioridade de release.  
4. Registrar data em **Última atualização** no topo deste arquivo.

---

## Referências

- [Benchmark omnichannel 2026 — matriz ClientOn](DEVLOG.md#benchmark-omnichannel-2026--matriz-clienton)  
- [Discussão telefonia — a retomar](DEVLOG.md#discussão-telefonia--a-retomar-2026-05-22)  
- [DOCUMENTO_NODES_FLUXO.md](DOCUMENTO_NODES_FLUXO.md)
