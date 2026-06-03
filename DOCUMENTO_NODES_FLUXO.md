# Documento de Funcionalidades dos Nodes de Fluxo

## Contexto

Escopo de produto e prioridades da release: **`DEVLOG.md` → [Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

Este documento consolida o que cada node faz hoje no projeto, considerando:

- representação e configuração no `FlowEditor` (frontend);
- execução real no `flow-executor` (backend).

## Legenda de status

- `Implementado`: possui comportamento de negócio no executor.
- `Parcial`: possui UI/configuração, mas execução limitada.
- `Sem função de negócio`: atualmente só segue para o próximo node (`next_node_id`) sem lógica específica.

## Mapa atual de nodes

### `inicio`

- Status: `Implementado`
- Frontend: node de início do fluxo.
- Backend: define o primeiro salto via `config.next_node_id`.

### `mensagem`

- Status: `Implementado`
- Frontend:
  - conteúdo da mensagem e **aguardar antes de enviar** (`send_delay_seconds`, máx. 300s);
  - interativo opcional com `config.interactive_type`:
    - `buttons`: **botões de resposta** (máx. 3) em `config.buttons[]` com `{ id, label }`;
    - `list`: **lista interativa** (máx. 10) em `config.list_items[]` com `{ id, label, description? }`.
- Backend:
  - ao entrar no node, aguarda `send_delay_seconds`;
  - renderiza template com variáveis (`{{variavel}}`);
  - sem botões: `outboundMessages[]` com `{ kind: "text", body }` e espelho em `messages`;
  - com botões: `{ kind: "interactive_buttons", body, buttons }` (WhatsApp Cloud API — reply buttons);
  - com lista: `{ kind: "interactive_list", body, listItems, listButtonText, listSectionTitle }`;
  - webhook inbound trata clique em botão/lista como texto (`button_reply.id` / `list_reply.id`);
  - canais sem interativo nativo (ex.: Twilio sessão): fallback em texto numerado;
  - segue para `config.next_node_id`.

### `receber_mensagem`

- Status: `Implementado`
- Frontend:
  - painel com texto opcional enquanto aguarda (`wait_hint`), variável do fluxo e `promptKey` (relatórios);
  - **tempo máximo por resposta** (`wait_timeout_seconds`) e saída **Timeout** no canvas (`next_node_id_on_timeout`);
  - paleta **Produção** (par visual de **Mensagem** = envio).
- Backend:
  - reutiliza a lógica de `capturar_entrada` em modo **texto**;
  - pausa com `status: awaiting_input` até `userInput` (inbound WhatsApp ou teste do fluxo);
  - se estourar o prazo: variáveis `response_timed_out`, `{variavel}_timed_out`, segue para `next_node_id_on_timeout`;
  - com `conversationId` / `sessionId` / `phone`: agenda timeout no Redis (`flow-wait-scheduler`, worker a cada 5s);
  - grava em `variableName` (padrão `mensagem_recebida`) e em `flow_response_events`;
  - trace com `nodeKind: receber_mensagem`.
- Retomada: `POST /api/flows/:flowId/execute` com `startNodeId` + `userInput`, ou `resumeReason: "timeout"` (automático pelo scheduler).

### `chamada_api`

- Status: `Implementado`
- Frontend:
  - configuração de URL, método, headers, body, auth, query params;
  - teste manual da API e mapeamento de resposta.
- Backend:
  - executa requisição HTTP real;
  - suporta autenticação (`bearer`, `basic`, `api_key`);
  - suporta timeout e tratamento de erro;
  - aplica `responseMapping` para variáveis do fluxo;
  - segue para `config.next_node_id`.

### `contador`

- Status: `Implementado`
- Frontend:
  - limite de passagens (`limite_passagens`);
  - variável do fluxo (`variableName`);
  - incremento por visita (`increment`, padrão 1);
  - duas saídas no canvas: **Dentro do limite** (`next_node_id_within`) e **Ultrapassou** (`next_node_id_exceeded`).
- Backend:
  - a cada execução do node, incrementa a variável;
  - se `contador > limite` após incremento → saída ultrapassou;
  - senão → saída dentro do limite;
  - expõe `{variavel}_ultrapassou` e `contador_ultrapassou` (boolean).
- Uso típico: loop de validação (resposta inválida → contador → mensagem de erro → receber de novo); ao estourar limite → encerramento ou transferir agente.

### `decisao`

- Status: `Implementado` (avançado)
- Frontend:
  - modos `simple`, `combined`, `multi_branch`, `ai`;
  - assistente IA para sugerir regras/rotas;
  - rascunho automático de conexões;
  - validação visual de rotas sem destino.
- Backend:
  - `simple`: 1 regra (sim/não);
  - `combined`: múltiplas regras com `AND`/`OR`;
  - `multi_branch`: múltiplas rotas com primeira regra verdadeira;
  - `ai`: escolha de rota via persona IA + fallback;
  - fallback com `default_next_node_id` quando aplicável.

### `conversa`

- Status: `Implementado` (motor IA do fluxo)
- Frontend:
  - modo **Prompt** ou **Fala estática**;
  - flag **Nó global** (contexto injetado em todas as etapas);
  - **Transições** com condição em linguagem natural + destino no canvas;
  - **Configurações do fluxo (IA)** no editor: prompt global, idioma/voz, modo flexível/rígido, RAG, guardrails.
- Backend (`execute-conversa-node.ts`, `flow-ai-runtime.ts`):
  - compõe prompt global + nós globais + bases de conhecimento + etapa atual;
  - **Modo rígido:** gera fala, aguarda input, resolve transição via IA;
  - **Modo flexível:** catálogo de etapas; IA escolhe resposta e próximo node;
  - **Guardrails:** policy anexada ao fluxo (live bloqueia/mascara; shadow audita);
  - retoma com `awaiting_input` e variável `last_user_message`.

### `funcao`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: sem execução específica; apenas encadeamento.

### `transferir_chamada`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: sem integração/ação de telefonia implementada no executor.

### `digitar_tecla`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: não interpreta DTMF/entrada de tecla no executor atual.

### `divisao_logica`

- Status: `Parcial`
- Frontend:
  - possui handles `true/false` e conexões visuais;
  - compartilha parte da mecânica de conexões com `decisao`.
- Backend:
  - não existe branch específica para `divisao_logica` no executor;
  - funciona apenas como nó genérico (`next_node_id`).
- Observação:
  - hoje a decisão real está concentrada no node `decisao`.

### `transferir_agente`

- Status: `Implementado`
- Frontend:
  - painel com fila, mensagem opcional ao cliente, prioridade;
  - preview da fila no canvas.
- Backend:
  - define variáveis `handoff_*` no contexto;
  - com `conversationId` na execução: atualiza conversa (`em_espera`, metadata.queue, tag Handoff fluxo);
  - encerra fluxo por padrão; opcional `next_node_id` para continuar após handoff.

### `extrair_variavel`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: não há parser/extração implementada no executor.

### `mcp`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: sem chamada MCP dedicada no executor atual.

### `capturar_entrada`

- Status: `Implementado`
- Frontend:
  - painel com pergunta, `promptKey` (relatórios), modo (`text`, `single_choice`, `multi_choice`);
  - opções editáveis, mínimo/máximo de seleções e variável do fluxo.
- Backend:
  - pausa execução com `status: awaiting_input` até receber `userInput`;
  - valida seleções (inclui limite máximo, ex.: até 3 opções);
  - grava variáveis (`variavel`, `variavel_labels`, `variavel_options`);
  - persiste evento em `flow_response_events` para relatórios (`GET /api/reports/flow-responses*`).
- Retomada: `POST /api/flows/:flowId/execute` com `startNodeId` do node de captura + `userInput`.

### `encerramento`

- Status: `Implementado`
- Frontend:
  - painel com mensagem final opcional e `reason_key` para relatórios;
  - somente entrada (sem saída).
- Backend:
  - branch explícita: `status: completed`, `stopReason: encerramento`;
  - variáveis `flow_status`, `flow_end_reason`, `flow_ended_at`.

### `tabulacao`

- Status: `Implementado`
- Frontend:
  - node na paleta de produção para registrar desfechos categóricos (ex.: abandono, recusa);
  - seleção de tabulação cadastrada por tenant e criação rápida no próprio editor.
- Backend:
  - CRUD de tabulações em `/api/tabulacoes`;
  - no executor, registra variável do fluxo (`variable_name`) e evento em `flow_response_events`;
  - agregável nos relatórios existentes (`/api/reports/flow-responses*`) via `question_key`.

### `sms`

- Status: `Sem função de negócio`
- Frontend: node visual (paleta "Em breve").
- Backend: sem envio de SMS no executor.

## Conclusão objetiva

Nodes com execução de negócio real hoje:

- `inicio`
- `mensagem`
- `receber_mensagem`
- `chamada_api`
- `decisao`
- `contador`
- `capturar_entrada`
- `transferir_agente`
- `encerramento`
- `tabulacao`

Todos os demais estão com foco principal em modelagem visual e ainda precisam de implementação dedicada no executor para refletirem o comportamento esperado de produto.

Escopo de produto e prioridades da release: **`DEVLOG.md` → [Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

## Fase atual e próximas ondas (atualizado 2026-05-22)

### Suportados na release (executor)

| Node | Status |
|------|--------|
| `inicio`, `mensagem`, `tabulacao`, `receber_mensagem`, `chamada_api`, `decisao`, `contador`, `capturar_entrada`, `transferir_agente`, `encerramento` | `Implementado` |

### Fora da fase imediata (paleta / UI apenas)

Permanecem editáveis no editor, **sem** lógica no executor: `conversa`, `funcao`, `transferir_chamada`, `digitar_tecla`, `transferir_agente`, `sms`, `extrair_variavel`, `mcp`. `divisao_logica` e `encerramento` são `Parcial`.

Opções de UX (não obrigatório nesta fase): ocultar da paleta ou marcar como "em breve".

### Próxima onda (produção — qualquer tenant cliente; 1º go-live = pesquisas)

Ver escopo vigente no DEVLOG (plataforma agnóstica: pesquisa, atendimento, captação, vendas).

**0–30 dias**

1. Integração **inbound WhatsApp** com `capturar_entrada` (lista/botões/texto → `userInput`).
2. ~~`transferir_agente`~~ — entregue (fila + handoff na conversa quando `conversationId`).
3. ~~`encerramento`~~ — entregue.
4. `extrair_variavel` ou IA para respostas abertas (próximo).

**Integrações fora de node (mesma janela):** Lead Ads + Click-to-WhatsApp (FB/IG); cadastro mestre; insights agregados + LLM on demand.

**31–60 dias**

1. `transferir_chamada` + stack voz/STT/TTS/transcrição (piloto 1 fluxo / 1 número).

### Qualidade

- Manter teste automatizado no executor para cada node promovido a `Implementado` (padrão: `mvp-fluxo-backend/test/capturar-entrada.test.ts`).

