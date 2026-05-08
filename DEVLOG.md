# Dev Log

## Checkpoint atual

- Data: 2026-04-19
- Commit de referência: `9a1b77a`
- Status: baseline funcional validado manualmente (backend + frontend)

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
