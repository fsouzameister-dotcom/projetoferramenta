# Dev Log

## Checkpoint atual

- Data: 2026-05-22
- Escopo vigente: **[Escopo vigente — maio/2026](#escopo-vigente--maio2026)** (prioridades atuais)
- Retomada rápida: **[Checkpoint sessão 2026-05-22 — alinhamento produto](#checkpoint-de-sessão-2026-05-22--alinhamento-produto)**
- Commits locais (push pendente se ainda não publicou): `7111392`, `6291e7f` + checkpoint desta sessão
- Primeiro cliente: **pesquisas** — WhatsApp BOT/IA + agente; FB/IG (CTWA + Lead Ads); telefonia semanas 5–8
- Meta **0–30 dias:** ~80% WhatsApp pesquisa + IA texto + insights (agregados + LLM) + cadastro mestre + ads
- Meta **31–60 dias:** telefonia piloto (1 fluxo, 1 número)

## O que foi implementado

### Backend

- Build corrigido com remoção de rota legada inconsistente.
- Configuração centralizada com variáveis críticas obrigatórias.
- Segurança de autenticação fortalecida:
  - sem segredo JWT hardcoded
  - verificação de tenant no middleware
  - sessão JWT configurada para 24h
- Pool de banco centralizado.
- Script de seed para ambiente de desenvolvimento:
  - `npm run seed:dev`
  - cria tenant + usuário admin de teste.
- `.env.example` atualizado com variáveis de desenvolvimento.

### Frontend

- Alinhamento de contrato com API:
  - login em `/login`
  - rotas protegidas em `/api/...`
- Tela de login simplificada para email/senha.
- Sidebar e tema visual premium refinados.
- Dashboard remodelado com:
  - filtros por canal/campanha
  - status da API via `/health`
- Nova página dedicada de Fluxos (`/flows`), removendo redundância do dashboard.
- Editor de fluxo com melhorias de usabilidade:
  - edição de node por duplo clique
  - botão "Salvar fluxo"
  - indicador "Alterações não salvas"
  - persistência de posição de nodes via `config.ui.position`
  - paleta de nodes mais compacta e amigável.
- Botão global Login/Logout contextual com validação de sessão.

## Comandos úteis

### Backend

- Dev: `npm run dev`
- Build: `npm run build`
- Testes: `npm test`
- Seed dev admin: `npm run seed:dev`

### Frontend

- Dev: `npm run dev`
- Build: `npm run build`

## Credenciais de desenvolvimento (seed padrão)

- Email: `admin@local.dev`
- Senha: `AdminDev123!`
- Tenant padrão dev: `00000000-0000-4000-8000-000000000001`

> Obs.: trocar essas credenciais para qualquer ambiente compartilhado.

## Próximos passos recomendados

1. Persistência nativa de posição no backend (campo dedicado, se aplicável).
2. Padronização de erros/contratos de resposta da API.
3. Testes de integração para auth, tenant e CRUD de fluxo/nodes.
4. Início do motor de execução de fluxo (sessão, estado e eventos).

## Próxima sessão (roteiro rápido)

### Objetivo da sessão

Fechar persistência de posição de nodes no backend com contrato explícito, reduzindo dependência de `config.ui.position`.

### Tarefa 1 (primeira a executar)

- Backend:
  - revisar schema de `nodes` para campo de posição dedicado
  - ajustar `createNode`, `updateNode` e `listNodesByFlow` para aceitar/retornar `position`
  - manter fallback temporário para `config.ui.position` durante migração
- Frontend:
  - manter leitura prioritária de `position` retornada pela API
  - preservar fallback enquanto houver dados legados

### Critério de aceite

- Criar flow, mover nodes, salvar, recarregar página e confirmar posições idênticas.
- Nenhum node novo deve depender de posição aleatória para render inicial.

### Comandos de retomada

```bash
cd c:\projetoferramenta
git pull origin master
```

Backend:

```bash
cd c:\projetoferramenta\mvp-fluxo-backend
npm run dev
```

Frontend:

```bash
cd c:\projetoferramenta\mvp-fluxo-frontend
npm run dev
```

---

## Checkpoint de sessão (2026-04-20)

### Entregas concluídas nesta sessão

- Padronização robusta de contrato API consolidada:
  - envelope de sucesso/erro com `meta.requestId` e `meta.timestamp`
  - catálogo central de `ERROR_CODES` por domínio
  - `schema.response` e validação de payload em rotas principais
- Frontend adaptado para contrato único:
  - uso de `unwrapApiData` e `getApiErrorMessage`
  - remoção de normalizações ad-hoc por tela
- Motor inicial de execução de fluxo implementado no backend:
  - arquivo: `mvp-fluxo-backend/src/flow-executor.ts`
  - endpoint: `POST /api/flows/:flowId/execute`
  - tipos suportados: `inicio`, `mensagem`, `chamada_api`, `decisao`
  - suporte a `responseMapping` para variáveis e comparação `HH:mm` em decisão
- Teste real do `Fluxo teste` executado com sucesso no endpoint novo:
  - sequência: `inicio -> mensagem -> chamada_api -> decisao -> mensagem`
  - mapeamento de variáveis (`hora_atual`, `dia_semana`) funcionando
  - decisão avaliada com operador `menor_que` e valor `14:00`

### Observações importantes para retomada

- A porta `3000` está ocupada por processo `node.exe` (PID 12004) com privilégio mais alto.
- Foi validado backend atualizado na porta `3001`.
- Para liberar a `3000`, abrir terminal como Administrador e executar:
  - `taskkill /PID 12004 /F /T`

### Próximo passo recomendado

1. Liberar porta `3000` e subir backend atualizado nela.
2. Adicionar testes automatizados do endpoint `/execute`:
   - ramo `true` e `false` da decisão
   - falha de API externa em `chamada_api`
3. Expor execução no frontend (botão "Executar fluxo" no editor) usando o novo endpoint.

---

## Checkpoint de sessão (2026-04-23)

### Entregas concluídas nesta sessão

- Backend:
  - Endpoint de execução de fluxo consolidado: `POST /api/flows/:flowId/execute`.
  - Suporte de execução para `inicio`, `mensagem`, `chamada_api` e `decisao`.
  - Contrato de erro/retorno robusto com códigos por domínio.
  - Gestão de usuários e permissões:
    - `GET /api/users`
    - `POST /api/users`
    - `PUT /api/users/:userId`
    - `DELETE /api/users/:userId`
  - Tratamento de conflito de e-mail duplicado com retorno claro:
    - `USER_EMAIL_ALREADY_EXISTS` (HTTP 409).
  - Módulo de atendimento de agente com persistência:
    - `GET /api/agent/conversations`
    - `POST /api/agent/conversations`
    - `POST /api/agent/conversations/:conversationId/messages`
    - `POST /api/agent/messages/:messageId/status`
  - Webhook para atualização de status por provedor:
    - `POST /webhooks/meta/status`
  - Persistência em Postgres das tabelas de atendimento:
    - `agent_conversations`
    - `agent_messages`
  - Campos de rastreio de status e erro por mensagem:
    - `delivery_status`
    - `error_code`
    - `error_description`
    - `provider_message_id`

- Frontend:
  - Separação de experiência por perfil:
    - Admin -> dashboard/admin
    - Agente -> `/agent`
  - Tela de administração de usuários com criação/edição/exclusão e perfil.
  - Tela de agente com layout operacional e melhorias de usabilidade:
    - busca e abas de atendimento
    - status de mensagem visível (`sent`, `delivered`, `read`, `failed`)
    - exibição de códigos/descrições de erro
    - rolagem isolada no chat com auto-scroll
    - barra de interação fixa (composer sempre visível)
  - Recursos de interação do agente:
    - enviar texto
    - enviar contato
    - enviar localização
    - enviar anexo
    - gravar/enviar áudio
    - selecionar emojis (lista padrão)
    - enviar imagem com preview no chat
  - Novo fluxo de criação de contato via popup:
    - número obrigatório
    - nome opcional
    - fila
    - template
    - parâmetros dinâmicos por template
    - botão `Enviar` para iniciar contato
  - Modo híbrido de dados no agente:
    - `VITE_AGENT_DATA_MODE=api|mock`
    - fallback automático para mock em indisponibilidade de API.

### Estado operacional validado

- Backend e frontend rodando localmente em:
  - Backend: `http://localhost:3000`
  - Frontend: `http://localhost:5173`
- Builds executados com sucesso nas entregas da sessão.
- Fluxos críticos de criação de contato, envio de mensagem e atualização de status foram validados via API.

### Próximos passos recomendados

1. Integrar templates reais da Meta (substituir lista fixa no popup).
2. Evoluir envio de mídia para upload persistente (imagem/anexo/áudio) com URL definitiva.
3. Implementar ingestão oficial de webhook da Meta para status e inbound de mensagens.
4. Consolidar relatórios do agente com métricas de status e falhas por período/fila.

---

## Roadmap Geral Atualizado (2026-04-23)

### Visão do produto

Plataforma omnicanal multi-tenant com:

- construtor e execução de fluxos;
- operação de atendimento (agente);
- integração oficial WhatsApp (Meta);
- IA por persona (texto/voz);
- analytics e insights on demand para gestão.

### Status por trilha

1) Core Backend/API

- Concluído:
  - contrato robusto de API (sucesso/erro/meta)
  - autenticação JWT com validações de tenant
  - execução de fluxo (`/api/flows/:flowId/execute`)
- Próximo:
  - ampliar cobertura de testes de execução e erros

2) Frontend Admin

- Concluído:
  - dashboard/fluxos/editor operacionais
  - gestão de usuários/perfis (admin_local, supervisor, agente)
- Próximo:
  - UX de validação avançada de formulários e mensagens inline

3) Frontend Agente

- Concluído:
  - portal separado por perfil
  - atendimento com busca/abas/chat
  - ações de envio (texto, contato, localização, anexo, áudio, imagem, emoji)
  - popup "Novo contato" com número/fila/template/parâmetros dinâmicos
  - layout fixo com rolagem no chat
- Próximo:
  - upload/persistência real de mídia (imagem/anexo/áudio)

4) Atendimento/Conversa Backend

- Concluído:
  - persistência em Postgres de conversas e mensagens
  - status de mensagem (`sent`, `delivered`, `read`, `failed`)
  - erro por mensagem (`error_code`, `error_description`)
  - webhook de status (`/webhooks/meta/status`)
- Próximo:
  - compatibilizar payload com webhook oficial da Meta

5) WhatsApp Meta

- Em aberto (aguarda número e vínculo):
  - onboarding de número
  - envio de template oficial
  - webhook inbound e status oficial

6) IA (novo escopo aprovado)

- Decisões já fechadas:
  - provedores: OpenAI + Gemini
  - seleção de provedor por configuração (admin)
  - fase 1: texto
  - insights: on demand
- Escopo:
  - personas múltiplas por tenant
  - roteiro por persona/fluxo
  - modo com documentos (RAG) e modo sem documentos
  - nome, voz, tom, avatar por persona
  - transcrição para operação e admin (fase voz/chamadas)

7) Transcrição (novo escopo aprovado)

- Objetivo:
  - serviço central reutilizável por agente e por análises administrativas em lote
- Status:
  - planejado para fase de voz/chamadas (com base preparada no roadmap)

> **Nota:** o roadmap acima (2026-04-23) mantém a visão de longo prazo. Para o que está **dentro/fora da release atual**, use o bloco abaixo.

---

## Escopo vigente — maio/2026

Documento de referência único para priorização. Atualizar este bloco quando mudar o que entra ou sai da frente ativa. Checkpoints históricos abaixo permanecem como log de sessão.

**Última revisão:** 2026-05-22 (alinhamento produto — primeiro cliente pesquisas)

### Primeiro cliente (comprometido)

- **Vertical:** empresa de **pesquisas** (coleta estruturada, ramificações, quotas).
- **Canais prometidos:** WhatsApp (BOT + IA + agente humano quando necessário) e, em seguida, **telefone** (BOT/IA voz).
- **Aquisição:** contatos de **anúncios Facebook e Instagram** — **Click-to-WhatsApp (CTWA)** e **Lead Ads** (webhook com nome/telefone). **Os dois** são requisito.
- **Operação:** automação (fluxos) e **central do agente** com a mesma importância.
- **Canais técnicos em produção:** **Meta Cloud API + Twilio** em paralelo; bloqueio Meta não cancela Twilio.
- **IA:** dica ao agente, decisão no fluxo, atendimento autônomo com persona; RAG documental na sequência; voz acoplada à telefonia.
- **SMS:** fora — só em futuro distante se inevitável.
- **BSPs adicionais** (360dialog, Zenvia, etc.): roadmap, não bloqueia go-live do primeiro cliente.

### Meta de entrega

| Janela | Objetivo (~80% da demanda do cliente) |
|--------|----------------------------------------|
| **0–30 dias** | WhatsApp pesquisa ponta a ponta (ambos provedores) + `capturar_entrada` via canal + **IA texto** no fluxo/agente + **insights completos** (dashboard + resumo LLM on demand) + **cadastro mestre MVP** + integração **CTWA + Lead Ads** |
| **31–60 dias** | **Telefonia piloto** (1 fluxo, 1 número) com BOT/IA voz e transcrição reutilizável |
| **Métricas de sucesso** | A definir pelo negócio; candidatas: taxa de conclusão da pesquisa, abandono por pergunta, tempo por pesquisa, % BOT vs agente, custo por pesquisa, origem campanha |

### Visão de plataforma

Plataforma omnicanal **multi-tenant**: construtor e execução de fluxos, atendimento humano, WhatsApp (Meta + Twilio), origem paid social, analytics/insights, cadastro mestre de respondente/cliente, telefonia com IA (fase 2).

### Dentro do escopo (entregue ou em construção ativa)

| Área | O que está no escopo | Estado |
|------|----------------------|--------|
| **Produção** | VPS, `app.` / `api.`, Apache, SSL, backup | Operacional — `RUNBOOK_OPERACAO.md` |
| **Core fluxos** | `inicio`, `mensagem`, `chamada_api`, `decisao`, `capturar_entrada` | Entregue no executor; ver nodes abaixo |
| **Relatórios base** | `/reports`, `flow_response_events` | Entregue — evoluir para insights completos |
| **Admin / agente** | Usuários, fluxos, IA admin (base), `/agent`, WhatsApp admin | Entregue — gaps listados em pendências |
| **WhatsApp dual** | Meta + Twilio, webhooks, outbound texto, status | Parcial — templates/mídia/fluxo inbound |
| **IA texto** | Personas, scripts, `decisao` modo AI, `/api/ai/respond`, dica agente | Base no repo — amarrar ao WhatsApp em produção |
| **Insights (completo)** | Agregados (`/reports`+) **e** jobs LLM on demand (`ai_insight_jobs` / `ai_insight_results`) | Planejado no devlog — **prioridade 0–30 dias** |
| **Cadastro mestre** | Cliente/respondente, N telefones/canais, origem campanha | **Prioridade 0–30 dias** — não implementado |
| **Anúncios FB/IG** | CTWA + Lead Ads webhook → conversa/fluxo | **Prioridade 0–30 dias** — não implementado |
| **Telefonia** | Piloto 1 fluxo / 1 número, STT/TTS/transcrição | **31–60 dias** (após WhatsApp + IA texto sólidos) |
| **Deploy** | `DEPLOY_COMPLETO_VPS.md`, `DEPLOY_WHATSAPP_VPS_COMPLETO.md` | Documentado |

Detalhe de nodes: `DOCUMENTO_NODES_FLUXO.md`.

### Nodes necessários para produção (pesquisas)

Implementar no executor (ou ocultar da paleta até lá):

| Node | Uso | Estado |
|------|-----|--------|
| `inicio`, `mensagem`, `decisao`, `capturar_entrada`, `chamada_api` | Roteiro da pesquisa + integrações | Implementado (capturar: falta bridge WhatsApp) |
| `transferir_agente` | Escalação humana | **Implementar** |
| `encerramento` | Fim da pesquisa no fluxo | Parcial → fechar branch |
| `extrair_variavel` ou IA | Resposta aberta | Avaliar IA vs parser dedicado |
| `transferir_chamada` | Telefonia fase 2 | Após piloto voz |
| Demais (`conversa`, `funcao`, `sms`, `mcp`, …) | Não bloqueiam go-live | Ocultar ou "em breve" |

### Fora do escopo (até nova decisão)

- **SMS** como canal.
- **Embedded Signup Meta** (Fase 2) — manter Opção B até demanda.
- **BSPs** além Meta/Twilio (exceto sob contrato específico).
- **Seleção de número outbound** por conversa (múltiplos números no tenant) — desejável, não bloqueia piloto.
- **Upload persistente** de mídia — importante, mas após núcleo pesquisa WhatsApp.
- Bug menu **`/settings`** — corrigir quando tocar frontend admin.

### Plano 0–30 dias (ordem de execução)

1. **WhatsApp estável (Meta + Twilio):** templates Twilio reais (`ContentSid`), templates Meta retomada, inbound → `capturar_entrada` (listas/botões/texto).
2. **IA texto rápida:** persona de pesquisa; fluxo autônomo + dica agente + `decisao` AI em cenários reais do cliente.
3. **`transferir_agente`:** executor + fila no painel agente.
4. **Cadastro mestre MVP:** entidade cliente/respondente + vínculos telefone/canal + campo origem (orgânico / CTWA / lead_id).
5. **Anúncios FB/IG:** CTWA (deep link / referral) + Lead Ads (webhook Meta → criar contato e disparar fluxo).
6. **Insights completos:** evoluir `/reports` (agregados, funil por pergunta) + `POST/GET /api/ai/insights/*` com jobs assíncronos e resumo em linguagem natural.
7. **Mídia WhatsApp** e polish agente — conforme capacidade na janela.

### Plano 31–60 dias

1. **Telefonia piloto:** 1 número, 1 fluxo espelhando pesquisa voz; STT/TTS; transcrição para agente e para insights em lote.
2. **RAG / documentos** (se pesquisa usar base de conhecimento).
3. Refino métricas e dashboards por campanha/fila.

### Contexto paralelo

- Tratativa **bloqueio Meta** (WABA/sender) — Twilio segue como canal de teste/produção.
- **Métricas de sucesso** — pendente definição pelo negócio.

### Critério para mudar este escopo

- Entrada de nova feature: atualizar tabelas **Dentro** / **Fora** / **Pendências** e data em **Última revisão**.
- Conclusão de pendência: mover linha para **Dentro** (entregue) ou remover; registrar no checkpoint de sessão abaixo.
- Roadmap de 2026-04-23 e sprints de IA: alterar só se a **visão de longo prazo** mudar; caso contrário, só este bloco governa a release.

### Documentos relacionados

| Documento | Uso |
|-----------|-----|
| `DEVLOG.md` (checkpoints) | Histórico de sessões |
| `DOCUMENTO_NODES_FLUXO.md` | Escopo técnico por node |
| `RUNBOOK_OPERACAO.md` | Operação VPS |
| `DEPLOY_COMPLETO_VPS.md` | Deploy unificado `master` |
| `DEPLOY_WHATSAPP_VPS_COMPLETO.md` | Meta Cloud API + credenciais |

---

## Design Técnico Inicial (sem ambiguidade)

### Fase 1 IA (texto) - alvo

Entregar IA textual com personas, roteiros e opcional de base documental, controlada por admin.

### Módulos backend previstos

1. `ai_provider_adapter`

- responsabilidade:
  - abstrair OpenAI/Gemini com interface única
- contrato:
  - `generateText({ provider, model, prompt, temperature, maxTokens, tenantId })`

2. `persona_service`

- responsabilidade:
  - CRUD de personas por tenant
  - configurações de estilo (nome, tom, instruções)
- entidades:
  - `ai_personas`
  - `ai_persona_profiles` (voz/avatar para fase 2)

3. `persona_script_service`

- responsabilidade:
  - scripts/roteiros por persona e fluxo
- entidade:
  - `ai_scripts`

4. `knowledge_service` (RAG)

- responsabilidade:
  - ingestão de documentos (txt/pdf/doc/docx/xls/xlsx/csv)
  - chunking + embeddings + index vetorial
- entidades:
  - `ai_documents`
  - `ai_document_chunks`
  - `ai_embeddings`

5. `ai_session_service`

- responsabilidade:
  - executar inferência contextual por conversa/fluxo/persona
  - log de requests/responses/custos
- entidades:
  - `ai_sessions`
  - `ai_messages`
  - `ai_usage_logs`

6. `insights_service` (on demand)

- responsabilidade:
  - execução sob demanda de análises de conversas
  - agregados por período/fila/persona/canal
- entidades:
  - `ai_insight_jobs`
  - `ai_insight_results`

### RBAC e governança

- Admin:
  - configura provedor/modelo/chaves/personas/scripts/documentos
  - executa insights on demand
- Supervisor:
  - consulta outputs operacionais e resultados de análise (sem alterar provedores)
- Agente:
  - usa recursos aprovados (sem alterar configuração de IA)

### Endpoints iniciais previstos

- `GET/POST /api/ai/personas`
- `GET/PUT/DELETE /api/ai/personas/:personaId`
- `GET/POST /api/ai/scripts`
- `POST /api/ai/documents/upload`
- `POST /api/ai/documents/:id/index`
- `POST /api/ai/respond` (texto)
- `POST /api/ai/insights/run` (on demand)
- `GET /api/ai/insights/:jobId`

### Critérios de aceite da Fase 1 IA

- Admin cria persona + script + escolhe provedor/modelo.
- Admin envia documento e indexa conhecimento.
- Agente aciona IA textual com e sem documentos.
- Sistema registra custo/latência/provedor por chamada.
- Admin executa insight on demand e visualiza resultado.

### Fase 2 (voz/transcrição/chamadas)

- STT/TTS por provedor configurável
- transcrição reutilizável para:
  - tela do agente (operação)
  - análises administrativas em lote
- armazenamento de segmentos, confiança e metadados de áudio/chamada.

---

## Plano de Implementação Sem Ambiguidade (Sprints)

### Sprint 1 - Fundação IA texto (personas, scripts, provider)

Objetivo: disponibilizar IA textual com escolha de provedor/modelo por tenant e controle administrativo.

#### Migrations SQL (Sprint 1)

1. `ai_provider_settings`
- `id` (uuid, pk)
- `tenant_id` (uuid, not null, fk tenants)
- `provider` (text, not null, check in `openai`, `gemini`)
- `model` (text, not null)
- `api_key_encrypted` (text, not null)
- `is_default` (boolean, default false)
- `is_active` (boolean, default true)
- `created_at`, `updated_at` (timestamptz)
- índice único parcial: um `is_default=true` por `tenant_id`

2. `ai_personas`
- `id` (uuid, pk)
- `tenant_id` (uuid, not null, fk tenants)
- `name` (text, not null)
- `description` (text, null)
- `tone` (text, null)
- `system_prompt` (text, not null)
- `avatar_url` (text, null)
- `is_active` (boolean, default true)
- `created_by` (uuid, fk users)
- `created_at`, `updated_at` (timestamptz)

3. `ai_scripts`
- `id` (uuid, pk)
- `tenant_id` (uuid, not null, fk tenants)
- `persona_id` (uuid, not null, fk ai_personas)
- `flow_id` (uuid, null, fk flows)
- `name` (text, not null)
- `script_content` (jsonb, not null)
- `version` (int, not null, default 1)
- `is_active` (boolean, default true)
- `created_by` (uuid, fk users)
- `created_at`, `updated_at` (timestamptz)
- índice: (`tenant_id`, `persona_id`, `is_active`)

4. `ai_usage_logs`
- `id` (uuid, pk)
- `tenant_id` (uuid, not null, fk tenants)
- `provider` (text, not null)
- `model` (text, not null)
- `persona_id` (uuid, null)
- `conversation_id` (uuid, null)
- `request_tokens` (int, default 0)
- `response_tokens` (int, default 0)
- `latency_ms` (int, null)
- `estimated_cost_usd` (numeric(12,6), null)
- `status` (text, not null)
- `error_code` (text, null)
- `created_at` (timestamptz)

#### Contratos de API (Sprint 1)

1. `POST /api/ai/providers`
- body:
  - `provider`, `model`, `apiKey`, `isDefault?`
- response (`201`):
  - `{ data: { id, provider, model, isDefault, isActive }, meta }`

2. `GET /api/ai/providers`
- response (`200`):
  - `{ data: [{ id, provider, model, isDefault, isActive }], meta }`

3. `POST /api/ai/personas`
- body:
  - `name`, `description?`, `tone?`, `systemPrompt`, `avatarUrl?`
- response (`201`):
  - `{ data: Persona, meta }`

4. `PUT /api/ai/personas/:personaId`
- body:
  - campos parciais de persona
- response (`200`):
  - `{ data: Persona, meta }`

5. `POST /api/ai/scripts`
- body:
  - `personaId`, `flowId?`, `name`, `scriptContent` (json)
- response (`201`):
  - `{ data: Script, meta }`

6. `POST /api/ai/respond`
- body:
  - `conversationId?`, `personaId`, `scriptId?`, `message`, `useKnowledgeBase` (bool)
- response (`200`):
  - `{ data: { text, provider, model, usage }, meta }`

#### Ordem de implementação (Sprint 1)

1) backend migrations + repositórios + schemas de validação.
2) adapter de provedores (`OpenAIAdapter`, `GeminiAdapter`) com timeout/retry controlado.
3) serviços (`persona`, `script`, `respond`) e logs de uso.
4) rotas protegidas por role (admin para configuração; agente para `respond`).
5) frontend admin: tela de provedores/personas/scripts.
6) frontend agente: consumo de `POST /api/ai/respond` (modo texto).

#### Checklist de testes de aceite (Sprint 1)

- criar e listar provedor por tenant (isolamento garantido).
- criar persona/script e editar sem vazar para outro tenant.
- responder com OpenAI e Gemini trocando configuração default.
- bloquear acesso de agente em endpoints administrativos.
- registrar uso/custo/latência em `ai_usage_logs`.

### Sprint 2 - Conhecimento (RAG) e documentos

Objetivo: habilitar modo com base documental por tenant/persona.

#### Migrations SQL (Sprint 2)

1. `ai_documents`
- `id`, `tenant_id`, `name`, `mime_type`, `storage_path`, `size_bytes`
- `status` (`uploaded`, `indexed`, `failed`)
- `uploaded_by`, `created_at`, `updated_at`

2. `ai_document_chunks`
- `id`, `tenant_id`, `document_id`, `chunk_index`
- `content` (text), `token_count` (int), `metadata` (jsonb)
- `created_at`

3. `ai_embeddings`
- `id`, `tenant_id`, `chunk_id`
- `provider` (text), `model` (text)
- `vector_ref` (text ou integração pgvector)
- `created_at`

#### Contratos de API (Sprint 2)

1. `POST /api/ai/documents/upload`
- multipart:
  - `file`, `personaId?`, `tags?`
- response (`201`):
  - `{ data: { documentId, status: "uploaded" }, meta }`

2. `POST /api/ai/documents/:id/index`
- body:
  - `embeddingProvider?`, `embeddingModel?`
- response (`202`):
  - `{ data: { jobId, status: "processing" }, meta }`

3. `GET /api/ai/documents`
- response (`200`):
  - `{ data: [{ id, name, status, createdAt }], meta }`

4. `POST /api/ai/respond` (evolução)
- incluir:
  - `knowledgeMode`: `none | tenant_docs | persona_docs`
  - `topK?` (default 5)

#### Ordem de implementação (Sprint 2)

1) upload seguro + storage local/S3 compatível.
2) pipeline de parsing por tipo (txt, pdf, docx, xlsx, csv).
3) chunking + embeddings + index vetorial.
4) recuperação semântica (`topK`) e composição de prompt contextual.
5) painel admin para upload/index/status.

#### Checklist de testes de aceite (Sprint 2)

- upload e indexação concluída em documentos suportados.
- resposta muda de qualidade quando `knowledgeMode` está ativo.
- isolamento estrito de documentos por tenant.
- fallback claro em falha de parsing/indexação.

### Sprint 3 - Insights on demand + governança operacional

Objetivo: permitir análises sob demanda sobre conversas, com segurança e rastreabilidade.

#### Migrations SQL (Sprint 3)

1. `ai_insight_jobs`
- `id`, `tenant_id`, `requested_by`
- `filters` (jsonb), `status` (`queued`, `running`, `done`, `failed`)
- `started_at`, `finished_at`, `created_at`

2. `ai_insight_results`
- `id`, `job_id`, `tenant_id`
- `summary` (text), `highlights` (jsonb), `risks` (jsonb), `opportunities` (jsonb)
- `metrics` (jsonb), `created_at`

#### Contratos de API (Sprint 3)

1. `POST /api/ai/insights/run`
- body:
  - `dateFrom`, `dateTo`, `queueIds?`, `agentIds?`, `personaIds?`, `includeVoiceTranscripts?`
- response (`202`):
  - `{ data: { jobId, status: "queued" }, meta }`

2. `GET /api/ai/insights/:jobId`
- response (`200`):
  - `{ data: { status, result? }, meta }`

3. `GET /api/ai/insights`
- response (`200`):
  - `{ data: [{ jobId, status, createdAt }], meta }`

#### Ordem de implementação (Sprint 3)

1) jobs assíncronos (fila com Redis/BullMQ).
2) agregação de dados de conversa por filtros.
3) geração de insights e persistência do resultado.
4) frontend admin para disparar job e visualizar resultado.

#### Checklist de testes de aceite (Sprint 3)

- apenas admin/supervisor autorizado executa e consulta insights.
- jobs grandes não bloqueiam API síncrona.
- resultado inclui resumo, riscos e recomendações acionáveis.
- trilha de auditoria disponível (`requested_by`, período, status).

### Sprint 4 - Fase de voz e transcrição (planejamento executivo)

Objetivo: preparar evolução para chamadas/áudio sem retrabalho arquitetural.

#### Entidades previstas

- `audio_assets` (metadados de áudio)
- `transcription_jobs`
- `transcription_segments` (texto, tempo inicial/final, confiança, speaker?)

#### Contratos previstos

- `POST /api/media/audio/upload`
- `POST /api/transcriptions/run`
- `GET /api/transcriptions/:jobId`
- `POST /api/ai/respond-voice` (fase posterior)

#### Critérios de pronto de arquitetura

- pipeline de transcrição reutilizável em:
  - tela do agente
  - análises administrativas em lote
- STT/TTS desacoplado por adapter de provedor
- retenção/mascaramento de PII configurável por tenant

---

## Dependências técnicas e decisões transversais

- Vetor: priorizar `pgvector` para reduzir complexidade inicial.
- Fila assíncrona: BullMQ + Redis já existente no stack.
- Storage de documentos/mídia: abstração com provider local + S3.
- Segurança:
  - criptografia de `api_key` em repouso
  - mascaramento de dados sensíveis em logs
  - limitação por tenant/rate limit em endpoints de IA
- Observabilidade:
  - métricas de latência, custo, taxa de erro por provedor/modelo.

## DoR / DoD global do programa IA

- DoR (Definition of Ready):
  - modelagem validada
  - contrato de API definido
  - critérios de aceite e RBAC aprovados
- DoD (Definition of Done):
  - testes automatizados críticos passando
  - contrato padrão `{ data/error, meta }` respeitado
  - auditoria por tenant e documentação de operação atualizada

---

## Cronograma Integrado (6 semanas)

Objetivo: avançar em paralelo nas trilhas de operação, WhatsApp Meta e IA, sem bloquear entrega.

### Semana 1 - Fundação IA + estabilidade operacional

- IA:
  - migrations Sprint 1 (`ai_provider_settings`, `ai_personas`, `ai_scripts`, `ai_usage_logs`)
  - serviços backend de provider/persona/script (CRUD inicial)
- Operação:
  - hardening de logs e mensagens de erro nos endpoints novos
  - smoke tests backend/frontend após migrations
- Entrega da semana:
  - admin já consegue cadastrar provedor e persona

### Semana 2 - Resposta IA texto em produção controlada

- IA:
  - `POST /api/ai/respond` com adapter OpenAI/Gemini
  - logging de uso/custo/latência em `ai_usage_logs`
  - RBAC completo (admin configura, agente consome)
- Operação:
  - ajuste de UX no admin para configuração de persona/script
- Entrega da semana:
  - fluxo ponta a ponta: admin configura, agente pergunta, IA responde

### Semana 3 - Trilha Meta oficial (onboarding e status)

- WhatsApp Meta:
  - preparar credenciais por tenant (app id, phone number id, token)
  - endpoint de envio de template oficial (primeiro caso de uso)
  - compatibilizar webhook de status no formato oficial da Meta
- IA:
  - refinamentos de prompt/script por persona
- Entrega da semana:
  - envio e atualização de status real (`sent/delivered/read/failed`) via Meta

### Semana 4 - Documentos e conhecimento (RAG)

- IA:
  - upload e indexação de documentos (Sprint 2)
  - parsing + chunking + embeddings + busca semântica (`knowledgeMode`)
- Operação:
  - painel admin para status de indexação
- Entrega da semana:
  - IA responde com e sem base documental por tenant/persona

### Semana 5 - Insights on demand para gestão

- IA/Admin:
  - jobs de insights (`ai_insight_jobs`, `ai_insight_results`)
  - execução assíncrona com Redis/BullMQ
  - filtros por período/fila/agente/persona
- Operação:
  - tela administrativa de disparo e leitura de resultados
- Entrega da semana:
  - admin/supervisor executam análise sob demanda com rastreabilidade

### Semana 6 - Consolidação + preparação fase voz/transcrição

- Consolidação:
  - testes de regressão integrados (admin, agente, IA, Meta)
  - tuning de custo/latência e políticas de retry/fallback
  - revisão de segurança (rate limit, masking PII, segredos)
- Fase 2 (preparo):
  - desenho técnico final de STT/TTS/transcrição reutilizável
  - definição do contrato dos jobs de transcrição para agente e lote admin
- Entrega da semana:
  - plataforma pronta para iniciar implementação de voz/chamadas

---

## Marco de decisão por trilha (Go/No-Go)

- Marco A (fim semana 2): IA texto estável com custo e latência monitoráveis.
- Marco B (fim semana 3): integração Meta oficial com status real funcionando.
- Marco C (fim semana 5): insights on demand com qualidade mínima aprovada.
- Marco D (fim semana 6): arquitetura pronta para fase voz/transcrição.

## Riscos do cronograma e mitigação

- Dependência externa Meta atrasar:
  - mitigação: manter camada mock/api híbrida no agente e avançar IA em paralelo.
- Custo de IA acima do esperado:
  - mitigação: limites por tenant, seleção de modelo por caso de uso, cache de contexto curto.
- Latência alta em RAG:
  - mitigação: pré-processamento de chunks, topK controlado e timeout por etapa.
- Complexidade em múltiplas trilhas:
  - mitigação: checkpoints semanais com critérios objetivos de aceite (Go/No-Go).

---

## Checkpoint de sessão (2026-04-24)

### Entregas concluídas nesta sessão

- Backend IA:
  - novo módulo `src/ai.ts` com schema auto-criado para:
    - `ai_provider_settings`
    - `ai_personas`
    - `ai_scripts`
    - `ai_usage_logs`
  - rotas IA adicionadas em `protected.routes.ts`:
    - `POST/GET /api/ai/providers`
    - `POST/GET/PUT /api/ai/personas`
    - `POST /api/ai/scripts`
    - `POST /api/ai/respond`
    - `POST /api/ai/assist-hint`
  - execução de decisão em fluxo evoluída para:
    - `decisionMode: simple`
    - `decisionMode: combined` (AND/OR)
    - `decisionMode: multi_branch`
    - `decisionMode: ai`

- Frontend Admin IA:
  - nova tela `AiAdmin` integrada ao menu lateral e rotas.
  - UX de persona em modo guiado (não técnico), com:
    - identidade, tom, estilo, objetivo, personalidade, diferenciais e foto.
  - remoção de redundância em persona:
    - removidos campos "O que falar" e "O que conseguir" da persona.
  - UX de roteiro sem código com etapas dinâmicas:
    - adicionar/remover etapas ilimitadas.
    - cada etapa com campos guiados de conteúdo e objetivo.

- Frontend Editor de Fluxo (node decisão):
  - configuração avançada dos modos de decisão no painel lateral.
  - rotas visuais com seleção de destino por dropdown.
  - handles dinâmicos para `multi_branch` e `ai`.
  - assistente IA no painel de decisão:
    - gera sugestão de regras/rotas com base em objetivo textual.
  - botão de aplicação automática:
    - "Aplicar sugestão + rascunho conexões" desenha arestas no canvas.
  - segurança de configuração:
    - destaque visual de rotas sem destino.
    - bloqueio de aplicação do rascunho quando faltam destinos obrigatórios.
  - status no card do node:
    - badge "OK" ou "N sem destino" no próprio canvas.

### Build/validação

- Backend build: OK.
- Frontend build: OK.

### Estado de git para retomada

- Branch atual de trabalho: `cursor/ia-admin-agent-hints`.
- Commits relevantes desta sessão:
  - `935f17c` feat: adicionar base IA no admin e dicas para agente
  - `2ed634b` feat: evoluir assistente de decisão e UX de roteiros IA

### Próximo tema já alinhado para retomada

- Publicação com URL fixa real (não temporária), em VPS InterServer:
  - domínio/subdomínios (`app.` e `api.`),
  - Nginx + SSL,
  - deploy contínuo para frontend/backend.

---

## Checkpoint de sessão (2026-04-26)

### Entregas concluídas nesta sessão

- DNS e domínio:
  - validação de `clienton.com.br`, `www.clienton.com.br`, `app.clienton.com.br`, `api.clienton.com.br`.
  - consolidação de acesso público por subdomínio (site/app/api).
- SSL/HTTPS:
  - certificado Let's Encrypt ativo para raiz e subdomínios.
  - app e api respondendo com HTTPS e status `200`.
- Publicação frontend:
  - `VITE_API_URL` ajustado para `https://api.clienton.com.br`.
  - título da aba atualizado para `app-ClientOn`.
  - favicon da aba trocado para imagem da marca (`public/favicon-clienton.png`).
- Correções operacionais:
  - login validado via API e navegador após correções de deploy/cache.
  - dashboard voltou a carregar sem erro interno após ajuste de conectividade local.
- Hardening inicial:
  - UFW ativo com regras:
    - `ALLOW`: `22`, `80`, `443`
    - `DENY`: `3000`, `5432`, `6379` (IPv4 e IPv6)
  - Docker ajustado para bind local de banco e redis:
    - `127.0.0.1:5432:5432`
    - `127.0.0.1:6379:6379`
- Backup de banco:
  - script `/usr/local/bin/backup_mvp_pg.sh` criado e validado.
  - agendamento diário em `crontab`: `15 3 * * *`.
  - backup validado em `/opt/backups/postgres/mvp_core_2026-04-26_180512.sql.gz`.

### Pendências registradas

- Registrar senha atual de Postgres em cofre seguro:
  - recuperar valor com:
    - `grep '^PG_PASSWORD=' /opt/mvp-fluxo-backend/.env`
  - salvar em gerenciador seguro (fora do repositório).
- Opcional de endurecimento adicional:
  - ajustar bind do backend para `127.0.0.1` no código (além de firewall), mantendo proxy Apache.

### Documentação operacional

- Novo runbook criado para operação da VPS:
  - `RUNBOOK_OPERACAO.md`

---

## Checkpoint de sessão (2026-05-04)

### Pendências operacionais rápidas (status)

- Endurecimento adicional concluído no código backend:
  - `HOST` centralizado em `src/config.ts` com fallback `0.0.0.0`.
  - `app.listen` em `src/server.ts` passou a respeitar `HOST` do ambiente.
  - resultado esperado em produção: `HOST=127.0.0.1` para bind local atrás do Apache.
- Registro de segredo operacional:
  - mantido procedimento para recuperar e salvar `PG_PASSWORD` em cofre seguro:
    - `grep '^PG_PASSWORD=' /opt/mvp-fluxo-backend/.env`
  - ação manual pendente no ambiente (fora do repositório), por política de segurança.

---

## Backlog registrado (2026-05-07)

### Demanda adiada para próxima janela

- Tema: implementação ponta a ponta do node `capturar_entrada`.
- Contexto:
  - hoje o node está presente no frontend, mas sem função de negócio dedicada no executor.
  - a execução atual cai no fluxo genérico por `next_node_id`.
- Escopo mínimo (MVP da entrega):
  1. definir contrato do node (`config`) e estrutura de saída para variáveis do contexto;
  2. implementar branch específica no `flow-executor`;
  3. ajustar UI/painel para exibir somente campos oficialmente suportados;
  4. criar teste automatizado de execução do node no backend;
  5. atualizar documentação de nodes com status `Implementado` após validação.
- Prioridade: alta (primeira onda de nodes fora do núcleo atual).
- Critério de aceite:
  - fluxo com `capturar_entrada` executa com persistência da entrada em variável de contexto e segue corretamente para o próximo node.

---

## Checkpoint de sessão (2026-05-07)

### Entregas concluídas nesta sessão (atendimento agente)

- Frontend (`AgentHome`):
  - exibição de remetente nas mensagens (agente/BOT/cliente) consolidada.
  - redução de área ocupada no topo da conversa para aumentar legibilidade.
  - removido input de nome do BOT da tela do agente (mantido como responsabilidade administrativa).
  - removida faixa fixa de dica IA; botão `Gerar dica IA` reposicionado na linha do contato.
  - recurso de simulação de mensagem inbound implementado como funcionalidade controlada.
  - recurso de simulação oculto por padrão e habilitável por admin para ambiente de testes.
- Backend + Frontend (ciclo do atendimento):
  - botão e fluxo de `Encerrar atendimento` implementados.
  - conversa passa a suportar ciclo operacional com estados:
    - `open`
    - `closed_manual`
    - `closed_window`
  - bloqueio de envio quando conversa está encerrada.
  - reabertura de atendimento implementada com regra Meta:
    - se janela aberta: permite retomar sem template.
    - se janela encerrada: exige template para retomada.
  - fechamento automático por expiração de janela de 24h preparado no backend.
  - inclusão de metadados de ciclo na conversa (fechamento e janela) para uso de UI e relatórios.
- Correção pós-deploy:
  - ajuste de serialização de campos opcionais da conversa para evitar falha de validação de resposta no Fastify ao encerrar atendimento.

### Regras de negócio alinhadas (Meta + operação)

- Encerramento manual continua existindo para caso resolvido.
- Janela Meta encerrada impede mensagem livre e força retomada via template.
- Conversa encerrada bloqueia composer até reabertura.
- Reabertura deve respeitar a janela:
  - aberta: sem template obrigatório.
  - fechada: template obrigatório.

### Discussão estratégica registrada para próxima etapa

- Não usar apenas contexto de assunto para consolidar histórico (evita falso vínculo entre demandas diferentes).
- Criar identidade de cliente independente da sessão de atendimento para relatórios e operação:
  - cadastro mestre do cliente com múltiplos números/canais.
  - capacidade de vincular números diferentes ao mesmo cliente.
  - visão analítica futura com filtros por:
    - sessão,
    - número,
    - cliente consolidado.
- Necessidade operacional futura:
  - agente escolher qual número/canal usar no contato ativo quando o cliente tiver múltiplos.

### Observação operacional da VPS

- Diretório de execução backend no servidor validado em:
  - `/opt/mvp-fluxo-backend`
- Ambiente de produção atual usa pasta publicada (sem `.git`), com deploy por cópia de build.

---

## Checkpoint de sessão (2026-05-08)

### Decisão arquitetural: Canal WhatsApp

- Adotada abordagem de adapter unificado por canal de mensageria, começando por **WhatsApp Cloud API direto** (sem broker/BSP).
- Sequência aprovada:
  1. Fase 1 (entregue): adapter `whatsapp_cloud_api` + Opção B (credenciais coladas pelo admin do tenant).
  2. Fase 2 (futuro): mesmo adapter, onboarding via Embedded Signup.
  3. Fase 3 (sob demanda): adapters Twilio / Zenvia / 360dialog apenas se cliente exigir.

### Entregas concluídas nesta sessão (Fase 1)

- Backend:
  - novo módulo `src/secrets.ts` — encriptação AES-256-GCM compartilhada (extraída de `ai.ts`).
  - novo módulo `src/whatsapp-channels.ts`:
    - tabelas `whatsapp_channel_accounts`, `whatsapp_channel_secrets`, `whatsapp_phone_numbers` (criadas idempotentemente).
    - cadastro de canal Opção B (WABA ID + Phone Number ID + Access Token cifrado).
    - resolução de tenant a partir de `phone_number_id` (roteamento de webhook).
    - obtenção de contexto outbound por tenant.
  - novo módulo `src/whatsapp-cloud-api.ts`:
    - envio de mensagem de texto via Graph API.
    - parser de webhook (mensagens de texto inbound + status `sent` / `delivered` / `read` / `failed`).
    - validação de `X-Hub-Signature-256` com `WHATSAPP_APP_SECRET`.
  - rotas públicas em `src/app.ts`:
    - `GET /webhooks/whatsapp` (verificação Meta).
    - `POST /webhooks/whatsapp` (eventos inbound + status).
    - parser JSON personalizado guardando `rawBody` para validação de assinatura.
  - rotas administrativas em `/api/whatsapp/channels` (GET/POST), restritas a admin local/supervisor.
  - integração no atendimento (`agent-conversations.ts`):
    - `recordInboundWhatsAppMessage` com dedupe por `wamid.*` (índice único parcial em `agent_messages`).
    - `appendAgentMessage` com envio real via Cloud API quando há canal configurado:
      - mensagem persiste como `sending` → após chamada Graph: `sent` (com `wamid`) ou `failed` (com `error_code`/`error_description`).
    - matching de telefone independente de máscara (busca por dígitos).
  - `http.ts`: novos códigos de erro `whatsapp.*`.
  - `config.ts`: variáveis `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (ou `META_APP_SECRET`), `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_SKIP_SIGNATURE_VERIFY`.
  - `.env.example` atualizado.
- Frontend:
  - nova página `WhatsAppAdmin` (`/admin/whatsapp`) — cadastro e listagem de canais.
  - sidebar com novo item "WhatsApp" e roteamento protegido por roles admin.
- Documentação operacional:
  - `RUNBOOK_OPERACAO.md` ganhou seção dedicada à Cloud API:
    - variáveis `.env`,
    - ajuste recomendado de Apache para proxy de `/webhooks/`,
    - configuração no Meta for Developers,
    - fluxo de cadastro pela ferramenta,
    - validação ponta a ponta,
    - diagnóstico via `journalctl` e `psql`,
    - procedimento de deploy desta entrega.

### Restrições conhecidas e pontos não cobertos (intencionais nesta fase)

- Envio real apenas para `type: "text"`. Contact / location continuam mock.
- Templates Meta e mídia (upload via `/media`) ainda não conectados ao fluxo de reabertura/UI.
- Tenant com múltiplos números: outbound usa o primeiro número cadastrado (sem seleção por conversa ainda).
- Embedded Signup permanece para Fase 2.

### Próxima sessão (roteiro rápido)

1. Deploy desta entrega na VPS (RUNBOOK seção WhatsApp).
2. Conectar número BRDID na Cloud API e cadastrar via `/admin/whatsapp`.
3. Validar inbound + outbound + ciclo de status com número real.
4. Após validação, planejar:
   - templates aprovados sincronizados via API (lista para o seletor de retomada),
   - upload e recepção de mídia (texto → áudio/imagem/documento),
   - seleção de número outbound por conversa quando houver mais de um.

---

## Checkpoint de sessão (2026-05-11)

### Objetivo

Evoluir a área admin de WhatsApp (configuração e governança) e registrar lições de deploy na VPS.

### Backend

- `whatsapp-channels.ts`:
  - `updateWhatsAppChannelLabel(tenantId, channelId, label)` — atualiza rótulo com escopo por tenant.
  - `deleteWhatsAppChannel(tenantId, channelId)` — remove conta do canal (CASCADE em segredos e números).
- Rotas em `protected.routes.ts` (prefixo `/api`, já com auth):
  - `PATCH /api/whatsapp/channels/:channelId` — body `{ label }` (1–200 caracteres).
  - `DELETE /api/whatsapp/channels/:channelId`.
- `http.ts`: códigos `WHATSAPP_CHANNEL_NOT_FOUND`, `WHATSAPP_CHANNEL_UPDATE_FAILED`, `WHATSAPP_CHANNEL_DELETE_FAILED`.

### Frontend

- `api/client.ts`: export `getApiOrigin()` — mesma origem de `VITE_API_URL` (sem barra final), para health e URLs públicas.
- `pages/WhatsAppAdmin.tsx`:
  - seção **Webhook e variáveis do servidor**: base da API, URL `…/webhooks/whatsapp` com botão copiar, checklist (env, proxy `/webhooks/`, Meta, campo `messages`, cadastro nomeado), referência aos runbooks;
  - **nome do canal obrigatório** no formulário (mínimo 2 caracteres no envio);
  - lista de canais com **Renomear** (inline) e **Remover** (confirmação).

### Documentação

- `RUNBOOK_OPERACAO.md` e `DEPLOY_WHATSAPP_VPS_COMPLETO.md`: deploy do frontend deve usar o **`DocumentRoot` real** do VirtualHost do app (na VPS atual: **`/var/www/app`**, não `/var/www/html`); comando sugerido de verificação com `grep ServerName/DocumentRoot` em `sites-enabled`.

### Deploy na VPS — lições registradas

1. **`/opt/mvp-fluxo-backend` sem `.git`**: não usar `git pull` ali; fluxo recomendado: clone em `/opt/build/projetoferramenta`, `rsync` do código para `/opt/mvp-fluxo-backend` (excluir `.env`, `node_modules`, `dist`), `npm ci` + `npm run build`, `systemctl restart mvp-backend`.
2. **Frontend (Vite 8)**: build exige **Node 20.19+** na máquina que roda `npm run build`; Node 18 quebra o Vite.
3. **Publicação estática**: após `npm run build`, `rsync` do `dist/` para o diretório do **VirtualHost de `app.`** (ex.: `rsync -av --delete dist/ /var/www/app/`).

### Comandos de retomada rápida (VPS)

```bash
ssh root@173.214.173.110
# Atualizar clone, sincronizar backend, build e serviço
cd /opt/build/projetoferramenta && git pull origin master
rsync -av --delete --exclude='.env' --exclude='node_modules' --exclude='dist' \
  /opt/build/projetoferramenta/mvp-fluxo-backend/ /opt/mvp-fluxo-backend/
cd /opt/mvp-fluxo-backend && npm ci && npm run build && systemctl restart mvp-backend
# Frontend (Node 20+)
cd /opt/build/projetoferramenta/mvp-fluxo-frontend
echo 'VITE_API_URL=https://api.clienton.com.br' > .env.production
npm ci && npm run build
rsync -av --delete dist/ /var/www/app/
```

*(Confirmar `DocumentRoot` do app antes do último `rsync`.)*

---

## Checkpoint de sessão (2026-05-15) — retomada exata

Use este bloco para continuar na **próxima sessão** sem depender do histórico do chat.

### Estado do código (workspace local)

- **Alterações não commitadas** na última verificação: conferir com `git status`.
- **Ficheiro não rastreado opcional**: `scripts/apache-app-spa-fallback.conf` (Apache / SPA fallback).
- **Antes do deploy na VPS**: `git add`, `git commit`, `git push origin master` (ou branch usada no clone `/opt/build/projetoferramenta`), depois `git pull` no servidor e fluxo `rsync` habitual.

### Correções WhatsApp / entrega e UI

**Backend**

- `agent-conversations.ts` — `updateAgentMessageStatus`: só persiste `error_code` / `error_description` quando `delivery_status === failed'`; caso contrário limpa erro (evita “Enviada (63051)” por webhook Meta com campo `errors` em status não-failed).
- `app.ts` — webhook `POST /webhooks/whatsapp`: só preenche erro da Meta quando `ev.status === failed'`; descrição compõe `title`, `message` e `error_data.details` quando existirem.
- `whatsapp-cloud-api.ts` — em falha síncrona da Graph API, prioriza `error_subcode` sobre `code` ao expor código numérico ao cliente.

**Frontend**

- `AgentHome.tsx` — código de erro visível apenas quando `delivery === failed'`; opcionalmente mostra `error_description` por baixo em falhas.

### Lista de templates Twilio Content no “Novo contato”

**Backend**

- `whatsapp-twilio-api.ts` — `fetchTwilioContentTemplates`: `GET https://content.twilio.com/v1/Content` (paginação), extrai SID `HX…`, nome, idioma e placeholders `{{1}}`, `{{2}}`, … dos `types`.
- `whatsapp-channels.ts` — `listTwilioContentTemplatesForTenant`: primeiro canal **`twilio_whatsapp`** do tenant (SID + Auth Token).
- `GET /api/agent/twilio/content-templates` — lista para o agente; falha Twilio upstream → **502**, código `WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED` (`http.ts`).
- `POST /api/agent/conversations` — body opcional **`templateContentSid`**; metadata da conversa e mensagem inclui `templateContentSid` quando enviado.

**Frontend**

- `AgentHome.tsx` — ao abrir modal Novo contato em modo API, carrega templates da rota acima; mistura templates reais com **fallback local** de 3 rótulos (marcados como exemplo); campos dinâmicos por variável (`{{n}}`); POST envia `templateName`, `templateContentSid`, `templateParams`.

**Próximo passo de produto** (ainda não feito): disparar **`POST Messages` Twilio com `ContentSid` + `ContentVariables`** ao criar contato, para envio template real fora só metadados/linha na conversa.

### Observações operacionais (esta sessão)

- **Twilio** — Auth Token é do canal Twilio, **não** é `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (só Meta Cloud API direta). Endpoint `GET /webhooks/whatsapp` pode dar **503** sem token Meta; **não bloqueia** fluxo Twilio (`/webhooks/twilio/messages` e `/status`).
- **Erro 63051** (Twilio/Meta): “sender ou WABA locked”; painel pode mostrar **Online** — validar **log da mensagem** na Twilio e suporte se persistir.
- **Apache API** — `ProxyPass /` para `127.0.0.1:3000` é suficiente; regras separadas `/webhooks/`, `/api/`, `/health` são redundantes se o destino for o mesmo backend.
- **`journalctl`** — correto: `journalctl -u mvp-backend` (com **j**); qualquer diretório na VPS; grep útil: `agent/conversations|/messages|twilio`.
- **Frontend build** — usar **`.env.production`** com `VITE_API_URL` na VPS (Node **20.19+**).

### Comando local para validar antes de commit

```bash
cd c:\projetoferramenta\mvp-fluxo-backend && npm run build
cd c:\projetoferramenta\mvp-fluxo-frontend && npm run build
```

### Próxima sessão (checklist rápido)

1. `git status` / commit / push das alterações desta entrega.
2. Deploy VPS (`DEVLOG` comandos de retomada + `DocumentRoot` `/var/www/app`).
3. Testar **Novo contato** com template `testeclienton` e canal Twilio configurado.
4. (Opcional) Implementar envio real de template via Twilio `ContentSid`.

---

## Checkpoint de sessão (2026-05-18) — deploy VPS + templates Twilio (pendente)

Use este bloco para retomar o diagnóstico da **lista de templates Twilio** no modal **Novo contato** sem depender do chat.

### Contexto paralelo (fora deste escopo)

- Usuário em tratativa do **bloqueio Meta** (WABA/sender) em paralelo.
- Frente **IA** adiada para sessão futura (Sprint 1 já existe no repo; ver checkpoint 2026-04-24).

### O que foi feito nesta sessão (deploy produção)

**Backend** (`/opt/mvp-fluxo-backend` na VPS `vps3354206`):

1. `npm ci` — concluiu OK; aviso de **1 high severity** (npm audit, não bloqueia deploy).
2. `npm run build` — OK (não registrado print, assumido antes do restart).
3. `systemctl restart mvp-backend` — aviso: *unit file changed on disk* → executado `systemctl daemon-reload` + `restart` (procedimento correto).

**Frontend** (`/opt/build/projetoferramenta/mvp-fluxo-frontend`):

1. Build Vite OK (~4.35s); aviso de chunk JS > 500 kB (performance, não bloqueia).
2. `rsync -av --delete dist/ /var/www/app/` — publicado em `/var/www/app/` (DocumentRoot correto do app).

**Validação superficial**

- `https://app.clienton.com.br` carrega após deploy.
- Login e Central do Agente acessíveis.

### Problema em aberto: templates Twilio não aparecem na UI

**Sintoma:** em **Novo contato** → dropdown **Template**, só aparecem os 3 fallbacks locais:

- Boas-vindas
- Lembrete pagamento
- Confirmação atendimento

**Comportamento esperado quando Twilio OK:** templates reais da Content API (ex. `testeclienton`, SID `HX…`) **acima** dos 3 exemplos.

**Onde a feature vive no código**

- UI: `mvp-fluxo-frontend/src/pages/AgentHome.tsx` — `useEffect` ao abrir modal chama `GET /agent/twilio/content-templates` **somente se** `resolvedMode === "api"`.
- API: `GET /api/agent/twilio/content-templates` em `protected.routes.ts` → `listTwilioContentTemplatesForTenant` (`whatsapp-channels.ts`) → `fetchTwilioContentTemplates` (`whatsapp-twilio-api.ts`).
- Fallback: `LEGACY_TEMPLATE_OPTIONS` (3 itens) quando API falha, modo mock, ou `data: []`.

### Diagnóstico tentado (sem conclusão definitiva)

1. DevTools → Rede (Fetch/XHR) com modal **Novo contato** aberto — usuário **não viu** linha `content-templates` de forma clara (possível modo mock ou filtro/rede).
2. Console: erro **`No route matches URL "/settings"`** ao clicar em **Configurações** no menu (`Sidebar.tsx` aponta `/settings` sem rota em `main.tsx`) — **não relacionado** a templates; usar `/admin/whatsapp` para canal Twilio.
3. Lista Twilio no repositório: parte da feature pode ainda estar **só no workspace local** (conferir `git grep content-templates HEAD` antes de assumir que VPS tem o código).

### Hipóteses ordenadas (para próxima sessão)

| # | Hipótese | Como confirmar |
|---|----------|----------------|
| 1 | **Modo mock** (`resolvedMode !== "api"`) — chamada nem dispara | Faixa “Fallback para modo emulado” na Central do Agente; Rede sem `content-templates` |
| 2 | **Canal Twilio ausente** no tenant — API 200 com `data: []` | `curl` autenticado no endpoint; psql em `whatsapp_channel_accounts` com `provider = twilio_whatsapp` |
| 3 | **Credenciais Twilio inválidas** — 502 | Resposta `WHATSAPP_TWILIO_CONTENT_TEMPLATES_FAILED`; logs `journalctl -u mvp-backend` |
| 4 | **Backend na VPS sem rota** — 404 | `curl` retorna 404 em `/api/agent/twilio/content-templates` |
| 5 | **Build frontend** sem `VITE_API_URL` / modo API | `.env.production` na VPS; rebuild + `rsync` |

### Comandos de diagnóstico (copiar na retomada)

```bash
# Na VPS — health
curl -i https://api.clienton.com.br/health

# Com JWT do login (substituir TOKEN)
curl -s -H "Authorization: Bearer TOKEN" \
  "https://api.clienton.com.br/api/agent/twilio/content-templates"

# Canal Twilio no banco
docker exec -it mvp-postgres psql -U mvp_user -d mvp_core -c \
  "SELECT wca.tenant_id, wca.label, wca.provider, ws.twilio_account_sid IS NOT NULL AS has_sid
   FROM whatsapp_channel_accounts wca
   LEFT JOIN whatsapp_channel_secrets ws ON ws.channel_account_id = wca.id
   WHERE wca.provider = 'twilio_whatsapp';"

# Logs backend
journalctl -u mvp-backend -n 100 --no-pager | grep -Ei "twilio|content-templates|template"
```

**No navegador:** `/agent` → Rede → Preservar log → Limpar → **Novo contato** → filtrar `twilio` ou `template`.

**Frontend rebuild explícito (se modo API suspeito):**

```bash
cd /opt/build/projetoferramenta/mvp-fluxo-frontend
printf '%s\n' 'VITE_API_URL=https://api.clienton.com.br' 'VITE_AGENT_DATA_MODE=api' > .env.production
npm ci && npm run build && rsync -av --delete dist/ /var/www/app/
```

### Bug lateral registrado (menu)

- `Sidebar.tsx`: item **Configurações** → `/settings` sem rota → ErrorBoundary 404.
- Correção futura: remover link, ou criar rota (ex. redirecionar admin para `/admin/whatsapp` ou página de settings real).

### Pendências de produto (inalteradas)

1. Fazer lista Twilio funcionar em produção (esta sessão).
2. Envio real de template: `POST Messages` Twilio com `ContentSid` + `ContentVariables` ao criar contato (ainda só metadados).
3. `git status` / commit / push se alterações locais de templates ainda não estiverem no `master` usado em `/opt/build/projetoferramenta`.

### Próxima sessão (checklist — templates)

1. Confirmar código no servidor: `git pull` em `/opt/build/projetoferramenta` + `rsync` backend se rota `content-templates` faltar.
2. `curl` autenticado em `/api/agent/twilio/content-templates` — anotar status e corpo.
3. Se `data: []`, cadastrar/validar canal **twilio_whatsapp** em `/admin/whatsapp` (Account SID + Auth Token).
4. Se mock, corrigir `VITE_AGENT_DATA_MODE=api` e conversas API 200.
5. Retestar **Novo contato**; sucesso = ver `HX…` / `testeclienton` no dropdown.
6. (Opcional) Corrigir rota `/settings` no menu.

---

## Checkpoint de sessão (2026-05-20) — `capturar_entrada` multi-escolha + relatórios

### Entregas

- Node **`capturar_entrada`** com modos `text`, `single_choice`, `multi_choice` (ex.: até 3 opções).
- Executor pausa com `status: awaiting_input`; retomada via `userInput` + `startNodeId`.
- Tabela analítica **`flow_response_events`** (criação automática via `ensureSchema` no primeiro uso).
- APIs de relatório:
  - `GET /api/reports/flow-responses`
  - `GET /api/reports/flow-responses/aggregates`
- Frontend:
  - painel de configuração no `FlowEditor`
  - rota **`/reports`** (Relatórios na sidebar)
- Testes: `mvp-fluxo-backend/test/capturar-entrada.test.ts`
- Documentação: `DOCUMENTO_NODES_FLUXO.md` atualizado (`capturar_entrada` = Implementado).

### Arquivos desta entrega (para `git` / VPS)

| Caminho | Papel |
|---------|--------|
| `mvp-fluxo-backend/src/capturar-entrada.ts` | parse, validação, prompt |
| `mvp-fluxo-backend/src/flow-response-events.ts` | schema + persistência + agregação |
| `mvp-fluxo-backend/src/flow-executor.ts` | branch `capturar_entrada` + `awaiting_input` |
| `mvp-fluxo-backend/src/http.ts` | códigos `FLOW_RESPONSES_*` |
| `mvp-fluxo-backend/src/routes/protected.routes.ts` | execute estendido + rotas `/reports/*` |
| `mvp-fluxo-backend/test/capturar-entrada.test.ts` | testes unitários |
| `mvp-fluxo-frontend/src/pages/FlowEditor.tsx` | UI do node |
| `mvp-fluxo-frontend/src/components/flownodes.tsx` | preview no canvas |
| `mvp-fluxo-frontend/src/pages/Reports.tsx` | página de relatórios |
| `mvp-fluxo-frontend/src/main.tsx` | rota `/reports` |
| `DOCUMENTO_NODES_FLUXO.md` | status do node |

### Contrato `config` do node (exemplo multi-escolha)

```json
{
  "prompt": "Escolha até três opções:",
  "promptKey": "interesses_produto",
  "inputMode": "multi_choice",
  "minSelections": 1,
  "maxSelections": 3,
  "variableName": "interesses",
  "options": [
    { "id": "fin", "label": "Financiamento" },
    { "id": "seg", "label": "Seguro" },
    { "id": "srv", "label": "Serviços" }
  ],
  "next_node_id": "<uuid-proximo-node>"
}
```

### Execução (API)

1. **Primeira passagem** (exibe pergunta, pausa):

```http
POST /api/flows/:flowId/execute
{ "variables": {} }
```

Resposta esperada: `status: "awaiting_input"`, `awaitingInput`, `currentNodeId`.

2. **Retomada** (grava variáveis + evento para relatório):

```http
POST /api/flows/:flowId/execute
{
  "startNodeId": "<id-node-capturar>",
  "userInput": ["fin", "seg"],
  "conversationId": "<opcional>",
  "phone": "+5511999999999"
}
```

Variáveis no contexto: `interesses`, `interesses_labels`, `interesses_options`.

### Deploy VPS — checklist (copiar na próxima subida)

Repositório de build na VPS (referência): `/opt/build/projetoferramenta`. Runtime backend: `/opt/mvp-fluxo-backend`. App: `/var/www/app`.

```bash
# 1) Código
cd /opt/build/projetoferramenta
git pull origin master

# 2) Backend
cd mvp-fluxo-backend
npm ci && npm run build
rsync -av --delete dist/ node_modules/ package.json /opt/mvp-fluxo-backend/
# (ajustar se o deploy local copia de outra forma)

# 3) Frontend
cd ../mvp-fluxo-frontend
printf '%s\n' 'VITE_API_URL=https://api.clienton.com.br' 'VITE_AGENT_DATA_MODE=api' > .env.production
npm ci && npm run build
rsync -av --delete dist/ /var/www/app/

# 4) Reiniciar API (cria flow_response_events no primeiro request)
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager

# 5) Smoke
curl -sS https://api.clienton.com.br/health
# Com JWT + x-tenant-id:
# GET /api/reports/flow-responses/aggregates
# POST /api/flows/:flowId/execute (awaiting_input) e retomada com userInput
```

**Banco:** não há migration SQL versionada; tabela `flow_response_events` é criada pelo backend (`CREATE TABLE IF NOT EXISTS`) ao primeiro `recordFlowResponseEvent` ou listagem de relatórios.

**Permissões:** rotas `/api/reports/*` exigem perfil `admin_local`, `supervisor` ou `admin`.

### Pendência pós-deploy (produto)

- Integrar webhook WhatsApp para enviar lista/botões e mapear resposta inbound → `userInput` + retomada automática do fluxo (base de dados e relatórios já prontos).

### Testes locais antes do push

```bash
cd mvp-fluxo-backend
npx tsx --test test/capturar-entrada.test.ts
npm run build
cd ../mvp-fluxo-frontend && npm run build
```

---

## Checkpoint deploy completo (2026-05-20) — WhatsApp + Twilio + Agent + Apache SPA

### Commits no `master` (subir juntos na VPS)

1. `capturar_entrada` + relatórios + `flow_response_events`
2. WhatsApp: correção status/erro Meta (`agent-conversations`, `app`, `whatsapp-cloud-api`)
3. Twilio Content templates (`whatsapp-twilio-api`, `whatsapp-channels`, rota agent)
4. `AgentHome`: templates no Novo contato, exibição de erro só em `failed`
5. `scripts/apache-app-spa-fallback.conf` — rewrite para SPA

### Roteiro único na VPS

Ver **`DEPLOY_COMPLETO_VPS.md`** (substitui executar os dois deploys separados).

Resumo: `git clone` → `rsync` backend → `npm ci && build` → `restart mvp-backend` → build frontend → `rsync` `/var/www/app/` → (opcional) Apache rewrite → smoke Parte H do doc.

### Pendência de produto (inalterada)

- Envio real de template Twilio com `ContentSid` + `ContentVariables` no POST de nova conversa (hoje metadados + UI).

> Pendências consolidadas: **[Escopo vigente — maio/2026](#escopo-vigente--maio2026)**.

---

## Checkpoint de sessão (2026-05-22) — alinhamento produto

Use este bloco para retomar **sem depender do histórico do chat**.

### O que foi feito nesta sessão (documentação)

1. Criado bloco **[Escopo vigente — maio/2026](#escopo-vigente--maio2026)** no `DEVLOG.md` (fonte única de prioridades).
2. Alinhados `DOCUMENTO_NODES_FLUXO.md`, `RUNBOOK_OPERACAO.md`, `DEPLOY_*` com links ao escopo.
3. Workshop de produto com o primeiro cliente (**empresa de pesquisas**) — decisões abaixo gravadas no escopo vigente.
4. Commits (verificar `git push` antes de deploy na VPS):
   - `7111392` — docs: consolidar escopo vigente maio/2026
   - `6291e7f` — docs: alinhar escopo ao primeiro cliente de pesquisas
   - *(esta sessão)* — checkpoint de retomada

### Decisões de produto (fechadas)

| Tema | Decisão |
|------|---------|
| Cliente ideal | Pesquisas; WhatsApp BOT/IA; telefone com BOT/IA depois |
| Dia feliz ~30 dias | ~**80%** da demanda acima (ver tabela no escopo vigente) |
| Canais | **Meta + Twilio** em produção; bloqueio Meta não cancela Twilio |
| Fluxo vs agente | **Ambos** (automação + central do agente) |
| IA | Dica agente, decisão no fluxo, persona autônoma; voz com telefonia; **rápido após WhatsApp** |
| Anúncios FB/IG | **Click-to-WhatsApp e Lead Ads** (os dois) |
| Telefonia | **Semanas 5–8**, piloto 1 fluxo / 1 número (não entra nos 30 dias do 80%) |
| Insights | **Logo de cara, completo:** dashboard agregados **+** jobs LLM on demand |
| Cadastro mestre | **Prioridade 0–30 dias** (MVP) |
| SMS | Fora (futuro distante, se necessário) |
| BSPs | Outros provedores no roadmap futuro |
| Nodes | Só os necessários para produção, **funcionais**; ocultar resto na paleta |
| Métricas de sucesso | **A definir** pelo negócio (candidatas no escopo vigente) |

### Plano 0–30 dias (ordem no escopo — não implementado ainda)

1. WhatsApp dual estável (templates Twilio/Meta, inbound → `capturar_entrada`).
2. IA texto no fluxo e agente.
3. `transferir_agente` no executor.
4. Cadastro mestre MVP + origem campanha.
5. CTWA + Lead Ads → contato/fluxo.
6. Insights completos (`/reports` + `/api/ai/insights/*`).
7. Mídia WhatsApp se couber.

### Plano 31–60 dias

- Telefonia piloto; RAG se necessário; refinamento métricas.

### Épico sugerido para próxima sessão de código

**“Pesquisa WhatsApp ponta a ponta”** — itens 1–3 do plano 30 dias (sem ads/insights na primeira leva), para o cliente testar questionário real no número.

Alternativa: desenhar fluxo **CTWA + Lead Ads** (entrada automática vs fila agente) antes de codar.

### Comandos de retomada

```powershell
cd c:\projetoferramenta
git pull origin master
git log -3 --oneline
```

Ler: `DEVLOG.md` → [Escopo vigente — maio/2026](#escopo-vigente--maio2026).

Deploy VPS (quando houver código novo): `DEPLOY_COMPLETO_VPS.md`.

### Pendências técnicas herdadas (ainda válidas)

- Templates Twilio no Novo contato (diagnóstico checkpoint 2026-05-18).
- Envio real `ContentSid` ao criar conversa.
- Menu `/settings` sem rota.
- Push dos commits de documentação desta sessão se ainda não publicados.
