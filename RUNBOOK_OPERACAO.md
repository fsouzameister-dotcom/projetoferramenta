# Runbook Operacional - ClientOn VPS

## Escopo

Este runbook cobre operacao basica de producao para:

- backend (`mvp-backend` em systemd)
- frontend servido por Apache
- banco Postgres e Redis em Docker
- SSL Let's Encrypt
- backup diario de banco

## Servicos e caminhos principais

- Backend env: `/opt/mvp-fluxo-backend/.env`
- Backend service: `mvp-backend`
- Stack Docker: `/opt/mvp-fluxo/docker-compose.yml`
- Frontend publicado: `/var/www/html` (estado atual)
- Backups SQL: `/opt/backups/postgres`
- Script backup: `/usr/local/bin/backup_mvp_pg.sh`

## Restart rapido

### Backend

```bash
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager
```

### Apache

```bash
systemctl reload apache2
systemctl status apache2 --no-pager
```

### Docker (Postgres/Redis)

```bash
cd /opt/mvp-fluxo
docker compose down
docker compose up -d
docker ps
```

## Health checks

```bash
curl -i https://api.clienton.com.br/health
curl -I https://app.clienton.com.br
curl -I https://clienton.com.br
```

## Logs essenciais

### Backend

```bash
journalctl -u mvp-backend -n 120 --no-pager
journalctl -u mvp-backend -f
```

### Apache

```bash
tail -n 120 /var/log/apache2/error.log
tail -n 120 /var/log/apache2/access.log
```

### Backup

```bash
tail -n 120 /var/log/backup_mvp_pg.log
ls -lah /opt/backups/postgres | tail -n 20
```

## Backup e restore

### Executar backup manual

```bash
/usr/local/bin/backup_mvp_pg.sh
```

### Ver agendamento atual (cron)

```bash
crontab -l
```

### Restore logico (ambiente de manutencao)

1. Escolher arquivo:

```bash
ls -lah /opt/backups/postgres
```

2. Restaurar no banco alvo:

```bash
gunzip -c /opt/backups/postgres/NOME_DO_BACKUP.sql.gz | PGPASSWORD='SENHA' psql -h 127.0.0.1 -p 5432 -U mvp_user -d mvp_core
```

## SSL (Let's Encrypt)

### Renovacao de teste

```bash
certbot renew --dry-run
```

### Renovacao manual

```bash
certbot renew
systemctl reload apache2
```

## Firewall e portas

### Ver regras UFW

```bash
ufw status numbered
```

Regras esperadas:

- allow: `22`, `80`, `443`
- deny: `3000`, `5432`, `6379` (v4/v6)

### Ver portas abertas

```bash
ss -tulpen | grep -E ":22|:80|:443|:3000|:5432|:6379"
```

Estado esperado:

- publicas: `22`, `80`, `443`
- internas/local: `5432`, `6379`
- `3000` pode aparecer em `0.0.0.0`, mas deve permanecer bloqueada por UFW

## Recuperacao de segredos operacionais

### Recuperar senha atual do Postgres (quando necessario)

```bash
grep '^PG_PASSWORD=' /opt/mvp-fluxo-backend/.env
```

### Recuperar JWT atual

```bash
grep '^JWT_SECRET=' /opt/mvp-fluxo-backend/.env
```

Importante:

- nao versionar segredos no Git
- armazenar em cofre de senhas da equipe

## WhatsApp Cloud API - canal direto Meta (Fase 1)

Roteiro completo passo a passo (incl. VPS sem `.git` em `/opt/mvp-fluxo-backend`, ordem das credenciais Meta): **`DEPLOY_WHATSAPP_VPS_COMPLETO.md`** na raiz do repositório.

Esta secao cobre a configuracao e o deploy do canal WhatsApp via Cloud API direta
(adapter `whatsapp_cloud_api`, Opcao B - credenciais coladas pelo admin).

### Variaveis de ambiente necessarias em /opt/mvp-fluxo-backend/.env

Acrescentar ao .env de producao (alem das ja existentes):

```bash
# Verificacao GET do webhook (Meta troca mensagens neste valor)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=defina_um_token_unico
# App Secret do app Meta (valida X-Hub-Signature-256 no POST do webhook)
WHATSAPP_APP_SECRET=app_secret_do_app_meta
# Opcional - default v21.0
# WHATSAPP_GRAPH_API_VERSION=v21.0
# Nunca habilitar em producao:
# WHATSAPP_SKIP_SIGNATURE_VERIFY=true
```

Apos editar o .env:

```bash
systemctl restart mvp-backend
journalctl -u mvp-backend -n 80 --no-pager
```

### Apache - confirmar proxy do webhook publico

O webhook Meta precisa ser acessivel em:

- `https://api.clienton.com.br/webhooks/whatsapp` (GET para verificacao)
- `https://api.clienton.com.br/webhooks/whatsapp` (POST para eventos)

O VirtualHost de `api.clienton.com.br` deve fazer proxy para o backend em `127.0.0.1:3000`
**de tudo** (nao apenas `/api`). Se hoje so existe `ProxyPass /api/`, adicionar tambem
o caminho de webhook:

```apache
ProxyPreserveHost On
ProxyPass        /webhooks/  http://127.0.0.1:3000/webhooks/
ProxyPassReverse /webhooks/  http://127.0.0.1:3000/webhooks/
ProxyPass        /api/       http://127.0.0.1:3000/api/
ProxyPassReverse /api/       http://127.0.0.1:3000/api/
ProxyPass        /health     http://127.0.0.1:3000/health
ProxyPassReverse /health     http://127.0.0.1:3000/health
```

Aplicar e validar:

```bash
apachectl configtest
systemctl reload apache2
curl -i "https://api.clienton.com.br/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&hub.challenge=ping"
```

Esperado: HTTP 200 com corpo `ping`. Se vier 503, o `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
ainda nao foi definido no .env.

### Configuracao no Meta for Developers

1. App Meta tipo Business com produto "WhatsApp" adicionado.
2. Em "Webhooks" do produto WhatsApp:
   - Callback URL: `https://api.clienton.com.br/webhooks/whatsapp`
   - Verify token: igual a `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - Subscrever campos: `messages` (essencial); opcionalmente `message_template_status_update`.
3. Anotar:
   - **WABA ID** (WhatsApp Business Account ID)
   - **Phone Number ID** do numero registrado na WABA
   - **App Secret** (Configuracoes do app -> Basico) -> usar como `WHATSAPP_APP_SECRET`
   - Gerar **Access Token permanente** via System User com permissoes
     `whatsapp_business_messaging` e `whatsapp_business_management`.

### Cadastrar canal pela ferramenta

1. Login com perfil `admin_local` ou `supervisor`.
2. Sidebar -> WhatsApp -> preencher:
   - WABA ID
   - Phone Number ID
   - Access Token (sera cifrado em repouso, AES-256-GCM com chave derivada do JWT_SECRET)
   - Display Phone (opcional, para visualizacao)
3. Salvar.

### Validar ponta a ponta

1. Enviar mensagem do celular pessoal para o numero registrado.
2. Painel do agente deve listar conversa nova com mensagem inbound.
3. Responder pelo painel.
4. Conferir no celular: mensagem chega.
5. No banco, a mensagem outbound deve ter `provider_message_id` iniciando com `wamid.`
   e `delivery_status` evoluindo para `delivered` / `read` (status entregue pelo webhook).

### Diagnostico rapido

```bash
# Logs do backend filtrando webhook
journalctl -u mvp-backend -n 200 --no-pager | grep -Ei "whatsapp|webhook|graph"

# Verificar canais cadastrados (via psql)
docker exec -it mvp-postgres psql -U mvp_user -d mvp_core -c \
  "SELECT a.tenant_id, a.label, p.phone_number_id, p.display_phone_number FROM whatsapp_channel_accounts a JOIN whatsapp_phone_numbers p ON p.channel_account_id = a.id;"

# Ver mensagens outbound recentes com status
docker exec -it mvp-postgres psql -U mvp_user -d mvp_core -c \
  "SELECT created_at, direction, delivery_status, provider_message_id, error_code FROM agent_messages ORDER BY created_at DESC LIMIT 20;"
```

Sintomas comuns:

- 403 no POST do webhook: assinatura X-Hub-Signature-256 invalida -> verificar `WHATSAPP_APP_SECRET`.
- 503 no GET do webhook: `WHATSAPP_WEBHOOK_VERIFY_TOKEN` ausente.
- Outbound parado em `sending` por muito tempo: erro na Graph API; ver `error_code` / `error_description`.
- Mensagem inbound nao aparece: `phone_number_id` recebido nao bate com tabela `whatsapp_phone_numbers`.

### Procedimento de deploy desta entrega

```bash
# 1. Atualizar codigo do backend e do frontend
cd /opt/mvp-fluxo-backend && git pull origin master && npm ci && npm run build
cd /opt/mvp-fluxo-frontend && git pull origin master && npm ci && npm run build

# 2. Publicar frontend (estrategia atual: copia da pasta dist para /var/www/html)
rsync -a --delete dist/ /var/www/html/

# 3. Reiniciar backend (aplica novas tabelas via ensureSchema)
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager

# 4. Atualizar Apache (somente se ProxyPass de /webhooks/ ainda nao existir)
# editar VirtualHost e:
apachectl configtest && systemctl reload apache2

# 5. Smoke
curl -i https://api.clienton.com.br/health
curl -i "https://api.clienton.com.br/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=$WHATSAPP_WEBHOOK_VERIFY_TOKEN&hub.challenge=ping"
```

Observacao: as tabelas `whatsapp_channel_accounts`, `whatsapp_channel_secrets`,
`whatsapp_phone_numbers` e o indice `uq_agent_msg_tenant_wamid` sao criados automaticamente
pelo backend no primeiro request relevante (idempotente, via `CREATE TABLE IF NOT EXISTS`).

