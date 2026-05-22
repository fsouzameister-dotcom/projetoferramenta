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
- Frontend: permite editar conteúdo e **enviar após** (`send_delay_seconds`, máx. 300s).
- Backend:
  - ao entrar no node, aguarda `send_delay_seconds` (ex.: tempo após o node anterior, como receber resposta);
  - renderiza template com variáveis (`{{variavel}}`) e adiciona em `messages`;
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

- Status: `Sem função de negócio`
- Frontend: node visual com edição de conteúdo no painel.
- Backend: não possui lógica específica; cai no fluxo genérico (`next_node_id`).

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
- `capturar_entrada`
- `transferir_agente`
- `encerramento`

Todos os demais estão com foco principal em modelagem visual e ainda precisam de implementação dedicada no executor para refletirem o comportamento esperado de produto.

Escopo de produto e prioridades da release: **`DEVLOG.md` → [Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

## Fase atual e próximas ondas (atualizado 2026-05-22)

### Suportados na release (executor)

| Node | Status |
|------|--------|
| `inicio`, `mensagem`, `receber_mensagem`, `chamada_api`, `decisao`, `capturar_entrada`, `transferir_agente`, `encerramento` | `Implementado` |

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

