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
- Frontend: permite editar conteúdo da mensagem.
- Backend:
  - renderiza template com variáveis (`{{variavel}}`);
  - adiciona saída em `messages`;
  - segue para `config.next_node_id`.

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

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: sem lógica de roteamento para agente/fila no executor.

### `sms`

- Status: `Sem função de negócio`
- Frontend: node visual.
- Backend: sem envio de SMS no executor.

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

- Status: `Parcial`
- Frontend: node de término visual (somente entrada).
- Backend: não tem branch específica; encerra na prática quando não há `next_node_id`.

## Conclusão objetiva

Nodes com execução de negócio real hoje:

- `inicio`
- `mensagem`
- `chamada_api`
- `decisao`
- `capturar_entrada`

Todos os demais estão com foco principal em modelagem visual e ainda precisam de implementação dedicada no executor para refletirem o comportamento esperado de produto.

Escopo de produto e prioridades da release: **`DEVLOG.md` → [Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

## Fase atual e próximas ondas (atualizado 2026-05-22)

### Suportados na release (executor)

| Node | Status |
|------|--------|
| `inicio`, `mensagem`, `chamada_api`, `decisao`, `capturar_entrada` | `Implementado` |

### Fora da fase imediata (paleta / UI apenas)

Permanecem editáveis no editor, **sem** lógica no executor: `conversa`, `funcao`, `transferir_chamada`, `digitar_tecla`, `transferir_agente`, `sms`, `extrair_variavel`, `mcp`. `divisao_logica` e `encerramento` são `Parcial`.

Opções de UX (não obrigatório nesta fase): ocultar da paleta ou marcar como "em breve".

### Próxima onda sugerida (após decisão no escopo vigente)

Ordem por impacto operacional — **nenhum item abaixo está comprometido até replanejamento explícito**:

1. `transferir_agente` — roteamento para fila/agente humano.
2. `transferir_chamada` — telefonia (depende de integração externa).
3. `extrair_variavel` — parser/extração no contexto do fluxo.
4. Integração **inbound WhatsApp** com `capturar_entrada` (lista/botões → `userInput`).

### Qualidade

- Manter teste automatizado no executor para cada node promovido a `Implementado` (padrão: `mvp-fluxo-backend/test/capturar-entrada.test.ts`).

