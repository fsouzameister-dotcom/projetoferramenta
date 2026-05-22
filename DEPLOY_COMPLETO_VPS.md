# Deploy completo na VPS — ClientOn (master)

Roteiro único para subir **tudo** que está em `origin/master` nesta fase:

- Capturar Entrada (multi-escolha) + Relatórios (`/reports`)
- Correções WhatsApp (status/erro Meta)
- Templates Twilio Content no **Novo contato**
- Fragmento Apache SPA (F5 em `/admin/whatsapp`, etc.)

Repo: `https://github.com/fsouzameister-dotcom/projetoferramenta.git`  
Branch: `master`

---

## Parte A — Na sua máquina

```powershell
cd c:\projetoferramenta
git pull origin master
git log -3 --oneline
git push origin master
```

Confirme que os commits recentes incluem `capturar_entrada`, `relatorios` e `whatsapp` / `twilio` / `agent`.

---

## Parte B — SSH na VPS

```bash
ssh root@173.214.173.110
```

---

## Parte C — Código atualizado

```bash
mkdir -p /opt/build
cd /opt/build
rm -rf projetoferramenta
git clone --branch master --depth 1 https://github.com/fsouzameister-dotcom/projetoferramenta.git
cd projetoferramenta
git log -3 --oneline
```

---

## Parte D — Backend

```bash
cp /opt/mvp-fluxo-backend/.env /root/.env.mvp-fluxo-backend.bak.$(date +%Y%m%d_%H%M%S)

rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  /opt/build/projetoferramenta/mvp-fluxo-backend/ \
  /opt/mvp-fluxo-backend/

cd /opt/mvp-fluxo-backend
npm ci
npm run build
systemctl daemon-reload
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager

curl -sS http://127.0.0.1:3000/health
curl -sS https://api.clienton.com.br/health
```

### Variáveis `.env` (WhatsApp Cloud — se usar canal Meta direto)

Edite **sem apagar** o que já existe:

```bash
nano /opt/mvp-fluxo-backend/.env
```

```bash
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...   # você define; igual no painel Meta
WHATSAPP_APP_SECRET=...             # Meta → Segredo do aplicativo
# WHATSAPP_SKIP_SIGNATURE_VERIFY=true   # NUNCA em produção
```

Reinicie após alterar: `systemctl restart mvp-backend`.

Detalhes Meta: `DEPLOY_WHATSAPP_VPS_COMPLETO.md`.

---

## Parte E — Frontend

```bash
grep -R "ServerName\|DocumentRoot" /etc/apache2/sites-enabled/
```

```bash
cd /opt/build/projetoferramenta/mvp-fluxo-frontend
printf '%s\n' 'VITE_API_URL=https://api.clienton.com.br' 'VITE_AGENT_DATA_MODE=api' > .env.production
npm ci
npm run build
rsync -av --delete dist/ /var/www/app/
```

---

## Parte F — Apache SPA (recomendado)

Evita 404 ao dar F5 em `/admin/whatsapp`, `/reports`, `/flows/...`.

```bash
a2enmod rewrite
nano /etc/apache2/sites-enabled/app.clienton.com.br-le-ssl.conf
```

Dentro do VirtualHost do **app**, no bloco `<Directory "/var/www/app">`, inclua o conteúdo de:

`/opt/build/projetoferramenta/scripts/apache-app-spa-fallback.conf`

```bash
apachectl configtest
systemctl reload apache2
```

---

## Parte G — Banco (automático)

Tabelas criadas pelo backend no primeiro uso (`ensureSchema`):

| Tabela | Quando |
|--------|--------|
| `flow_response_events` | Primeira captura / relatório |
| `agent_conversations`, `agent_messages` | Já existentes |
| `whatsapp_channel_*` | Cadastro WhatsApp |

Não é necessário rodar migration SQL manual.

---

## Parte H — Testes pós-deploy

### 1. Saúde

```bash
curl -i https://api.clienton.com.br/health
curl -I https://app.clienton.com.br/reports
```

### 2. Admin — Fluxos e Relatórios

- Login admin/supervisor
- **Fluxos** → node **Capturar Entrada** (multi-escolha, até 3)
- **Relatórios** → página carrega

### 3. Agente — Novo contato (Twilio)

- Canal **twilio_whatsapp** em `/admin/whatsapp` (Account SID + Auth Token)
- **Agente** → **Novo contato** → dropdown deve listar templates (`HX…`) ou fallback de exemplo
- `journalctl -u mvp-backend -n 80 --no-pager` se 502 em templates

### 4. API captura (opcional)

```http
POST /api/flows/{flowId}/execute  → awaiting_input
POST com startNodeId + userInput   → completed + evento em relatório
GET  /api/reports/flow-responses/aggregates
```

### 5. Webhook WhatsApp (se Cloud API)

```bash
curl -i "https://api.clienton.com.br/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=ping"
```

Proxy Apache: ver `DEPLOY_WHATSAPP_VPS_COMPLETO.md` Parte E.

---

## Parte I — Diagnóstico

```bash
journalctl -u mvp-backend -n 150 --no-pager
tail -n 80 /var/log/apache2/error.log
```

| Sintoma | Verificar |
|---------|-----------|
| Templates vazios / 502 | Credenciais Twilio no canal; rota `content-templates` no build |
| Frontend chama mock | `.env.production` com `VITE_AGENT_DATA_MODE=api` + rebuild |
| 404 em rotas do app | Parte F (rewrite SPA) |
| Webhook 403 | `WHATSAPP_APP_SECRET` |
| Relatório vazio | Executar fluxo com `userInput` após `awaiting_input` |

---

## Documentos relacionados

| Arquivo | Conteúdo |
|---------|----------|
| `DEPLOY_WHATSAPP_VPS_COMPLETO.md` | Meta webhook, credenciais, proxy |
| `DEPLOY_CAPTURAR_ENTRADA_VPS.md` | Só multi-escolha + relatórios |
| `RUNBOOK_OPERACAO.md` | Operação diária, backup, logs |
| `DEVLOG.md` | Histórico, checkpoints e **[Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)** |

---

*Atualize IP, domínios e paths se o ambiente mudar.*
