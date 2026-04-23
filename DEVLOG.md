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
