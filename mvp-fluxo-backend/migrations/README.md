# Migrations PostgreSQL — ClientOn

## Situação atual do projeto

Hoje várias tabelas são criadas em runtime com `CREATE TABLE IF NOT EXISTS` dentro de `ensureSchema()` (ex.: `flow_response_events`, `tabulacoes`, `agent_conversations`). Isso funciona para MVP, mas **não versiona** mudanças de schema entre ambientes.

Esta pasta introduz migrations SQL versionadas, aplicadas por:

```bash
cd mvp-fluxo-backend
npm run migrate
```

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `001_schema_migrations.sql` | Tabela de controle `schema_migrations` |
| `009_ai_insights.sql` | Insights IA (jobs, templates) |
| `010_agent_bot_conversation_dedup.sql` | Fecha `bot_only` duplicadas por telefone; índice único parcial |

Ver também: [INBOUND-ROUTING-E-HANDOFF.md](../../docs/flows/INBOUND-ROUTING-E-HANDOFF.md)

## Modelo proposto (cadastro mestre)

- **`clients`**: pessoa/empresa atendida (cadastro mestre), por `tenant_id`
- **`client_phones`**: N telefones por cliente; `phone_e164` único por tenant
- **`mailings`**: campanha/lista de disparo
- **`mailing_recipients`**: destinatários da campanha (com status de envio)

## Próximos passos recomendados

1. Rodar `npm run migrate` em dev e na VPS (backup antes).
2. Migrar gradualmente tabelas `ensureSchema` para migrations numeradas.
3. Implementar API CRUD de `clients` / import CSV para `mailing_recipients`.
4. Ao receber WhatsApp inbound: resolver `client_id` pelo telefone e gravar em `agent_conversations.client_id`.

## Produção (VPS)

```bash
cd /opt/build/projetoferramenta/mvp-fluxo-backend
git pull origin master
npm ci
npm run migrate
```

Não substitui tabelas já criadas por `ensureSchema` — apenas adiciona as novas.
