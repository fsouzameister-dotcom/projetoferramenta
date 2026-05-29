# Backlog de produto — ClientOn

> Fonte viva de itens **fora do escopo 0–30 / 31–60** ou **polish pós go-live**.  
> Escopo ativo e prioridades de release: **[DEVLOG.md → Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)**.

**Última atualização:** 2026-05-29

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
| P2 | [Tutoriais interativos in-app (product tours)](#épico-tutoriais-interativos-in-app) | 61–90d | 📋 | Driver.js / Joyride; tours por role |
| P2 | [Checklist configuração mínima do tenant](#épico-checklist-configuração-mínima-do-tenant) | 61–90d | 📋 | Onboarding self-service (% WhatsApp, fluxo, agente) |
| P2 | [NPS / CSAT pós-interação](#épico-nps--csat-pós-interação) | 61–90d | 📋 | Node ou pesquisa pós-fluxo; correlacionar relatórios |
| P2 | [Cadastro mestre API consolidada](#épico-cadastro-mestre-api-consolidada) | 61–90d | 📋 | Endpoint único cliente + telefones e visão unificada para UI |
| P2 | [Glossário de erros de envio WhatsApp](#épico-glossário-de-erros-de-envio-whatsapp) | 61–90d | 📋 | Código Meta/Twilio → significado + ação sugerida na Central do Agente e FAQ |
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
