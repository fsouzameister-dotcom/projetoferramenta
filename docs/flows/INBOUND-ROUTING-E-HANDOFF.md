# Roteamento inbound, campanhas e handoff Cleo

Documentação das correções aplicadas em **junho/2026** para o link do site (`wa.me`), conversas duplicadas e transferência da Cleo para a fila humana.

## Contexto

| Canal | `source_type` | Observação |
|-------|---------------|------------|
| Twilio WhatsApp | `twilio_whatsapp` | Webhook principal do número comercial |
| Meta Cloud API | `whatsapp_meta` | Mesmo número pode receber evento em paralelo |

Rotas inbound relevantes (tenant principal):

| Rota | `source_key` | Fluxo | Gatilhos |
|------|--------------|-------|----------|
| Cleo — Site (wa.me) | `_trigger:site-clienton` | Fluxo Cleo | `quero conhecer o clienton`, etc. (`match_any_source_key: true`) |
| Cleo — WhatsApp padrão | `twilio:AC…:551150284949` | Fluxo Cleo | — |
| Fox — Cadastrar-se | `_trigger:fox-cadastrar-se` | Fluxo Fox Pesquisas | `cadastrar-se`, etc. |

Seed das rotas Cleo:

```bash
cd mvp-fluxo-backend
npm run seed:cleo-inbound
```

---

## Problema 1: Duas conversas ao testar pelo site

### Sintoma

Ao enviar *"Olá! Quero conhecer o ClientOn."* pelo link do site:

- Uma conversa **em espera** com só a mensagem do cliente
- Outra no **fluxo Fox** (sessão antiga), tratando o texto do site como resposta de formulário

### Causas (combinadas)

1. **Webhooks Meta + Twilio** processavam o mesmo texto em paralelo
2. **Gatilho do site** só era avaliado para `twilio_whatsapp`; no Meta o gatilho não batia
3. **Sessão Fox** no Redis/metadata apontava para conversa `bot_only` antiga ainda aberta
4. **Race** na criação de conversas `bot_only` (duas abertas para o mesmo telefone)

### Correções

| Área | Arquivo | O que mudou |
|------|---------|-------------|
| Gatilho cross-canal | `inbound-routes.ts`, `inbound-channel-match.ts` | Rotas com `match_any_source_key` valem para Meta e Twilio |
| Dedup por telefone+texto | `inbound-orchestrator.ts` | Claim Redis 20s (`inbound:flow:phone-claim:…`) |
| Reinício por gatilho | `inbound-orchestrator.ts`, `agent-conversations.ts` | `archiveOpenBotConversationsForPhone` + limpa sessão antes de gravar inbound |
| Lock na conversa bot | `agent-conversations.ts` | `pg_advisory_xact_lock` em `getOrCreateBotPhaseConversation` |
| Índice único | `migrations/010_agent_bot_conversation_dedup.sql` | Uma conversa `bot_only` aberta por telefone/tenant |
| Sessão em conversa fechada | `inbound-flow-session.ts` | Não restaura sessão Redis se `lifecycle_status ≠ open` |

### Ordem de processamento inbound (resumo)

```
claim provider → bot gate → campanha (raw) → gatilho mensagem (early)
→ se gatilho com triggers: ignora campanha, arquiva bot_only, limpa sessão
→ claim telefone+texto → grava inbound bot → campanha efetiva → sessão → fluxo
```

---

## Problema 2: Site ia para Fox mesmo após encerrar atendimento

### Sintoma

Após encerrar atendimento humano, novo teste pelo site ainda caía no Fox.

### Causa principal

**Rota de campanha** (`campaign-inbound.ts`) continuava ativa para telefones que já tinham **respondido** a mailings Fox (status `responded` ainda entrava na query de 30 dias). Isso **anulava** o gatilho do site Cleo.

### Correções

| Mudança | Detalhe |
|---------|---------|
| Campanha só enquanto aguarda 1ª resposta | Status `sent`, `delivered` ou `read` — não `responded` |
| Gatilho do site tem prioridade | Se `messageRouteEarly` tem `message_triggers`, `campaignRoute` é ignorada |
| Cache Redis invalidado | `clearCampaignInboundRoute` ao marcar resposta; validação do cache no `resolve` |

---

## Problema 3: Cleo não transferia para fila humana

### Sintoma

Cleo respondia *"vou encaminhar para um atendente"* em loop, mas a conversa não aparecia na Central do Agente.

### Causa

O nó **Conversa** dependia da IA escolher a transição `esc_humano`. Muitas vezes a IA só **prometia** transferência sem executar o nó `transferir_agente` (que chama `applyFlowAgentHandoff`).

Em etapas de **coleta de dados** (`receber_mensagem`), não havia atalho para humano.

### Correções

| Arquivo | O que mudou |
|---------|-------------|
| `flow-human-handoff.ts` | Detecção determinística de pedido de humano |
| `flow-executor.ts` | Interrupção global → nó `transferir_agente` (fila Geral) em qualquer etapa |
| `flow-ai-runtime.ts` | Transição `esc_humano` por regra antes da IA |
| `execute-conversa-node.ts` | Se destino é `transferir_agente`, não gera resposta IA duplicada |

### Handoff efetivo

O nó `transferir_agente` executa `applyFlowAgentHandoff`:

- `status` → `em_espera`
- `metadata.bot_only` → `false`
- `metadata.flowHandoff` → `true`
- Tag **Handoff fluxo**
- Limpa sessão inbound do bot (`detachInboundBotFlow`)

A conversa passa a aparecer na **Central do Agente** na fila configurada (ex.: **Geral**).

---

## Deploy

### Via GitHub (padrão)

```bash
python scripts/deploy-vps-remote.py
```

### Direto do working tree local

Útil quando o push ainda não foi feito:

```bash
python scripts/deploy-vps-local.py
```

Ambos aplicam `npm run migrate` na VPS (inclui `010_agent_bot_conversation_dedup.sql`).

---

## Diagnóstico em produção

Scripts úteis (não versionados; rodar localmente com `.vps-deploy-secret`):

- `scripts/vps-diagnose-phone-now.py` — conversa aberta, mensagens, Redis, eventos Fox
- `scripts/vps-verify-campaign-fix.py` — `resolveCampaignInboundRoute` + gatilho site para um telefone

Consultas rápidas:

```sql
-- Conversas abertas bot_only duplicadas (não deve retornar linhas após migration 010)
SELECT tenant_id, regexp_replace(phone, '[^0-9]', '', 'g'), count(*)
FROM agent_conversations
WHERE lifecycle_status = 'open' AND metadata->>'bot_only' = 'true'
GROUP BY 1, 2 HAVING count(*) > 1;

-- Campanha ainda roteando (só sent/delivered/read)
SELECT mr.status, mr.phone_e164, m.name, f.name
FROM mailing_recipients mr
JOIN mailings m ON m.id = mr.mailing_id
JOIN flows f ON f.id = m.flow_id
WHERE regexp_replace(mr.phone_e164, '[^0-9]', '', 'g') = '5511992007226'
ORDER BY mr.sent_at DESC;
```

---

## Testes automatizados

```bash
cd mvp-fluxo-backend
npx tsx --test test/inbound-routes.test.ts
npx tsx --test test/flow-human-handoff.test.ts
npx tsx --test test/flow-field-validators.test.ts
```

---

## Checklist de validação manual

1. **Site → Cleo**: link `wa.me` com *Quero conhecer o ClientOn* → uma conversa, fluxo Cleo (não Fox)
2. **Fox**: mensagem *cadastrar-se* → fluxo Fox Pesquisas
3. **Handoff**: *Me passe para um humano* → mensagem de encaminhamento + conversa na Central, fila Geral, `em_espera`
4. **Pós-campanha**: número que já respondeu mailing Fox → site ainda vai para Cleo

---

## Arquivos principais alterados

```
mvp-fluxo-backend/src/inbound-orchestrator.ts
mvp-fluxo-backend/src/inbound-routes.ts
mvp-fluxo-backend/src/inbound-channel-match.ts
mvp-fluxo-backend/src/campaign-inbound.ts
mvp-fluxo-backend/src/agent-conversations.ts
mvp-fluxo-backend/src/inbound-flow-session.ts
mvp-fluxo-backend/src/flow-human-handoff.ts
mvp-fluxo-backend/src/flow-executor.ts
mvp-fluxo-backend/src/flow-ai-runtime.ts
mvp-fluxo-backend/src/execute-conversa-node.ts
mvp-fluxo-backend/migrations/010_agent_bot_conversation_dedup.sql
scripts/deploy-vps-local.py
```
