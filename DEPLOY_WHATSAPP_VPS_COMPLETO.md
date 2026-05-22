# Deploy WhatsApp Cloud API na VPS — roteiro completo

Este documento consolida **comandos exatos**, **ordem dos passos** e **origem de cada segredo**, para não depender de adivinhação.  
Repo remoto de referência: `https://github.com/fsouzameister-dotcom/projetoferramenta.git`

---

## Diretrizes (fixas)

1. **Nunca commite** `.env`, tokens ou segredos no Git.
2. Em produção, **não use** `WHATSAPP_SKIP_SIGNATURE_VERIFY=true` (só desenvolvimento local).
3. O diretório **`/opt/mvp-fluxo-backend` na VPS pode não ter `.git`** (deploy histórico por cópia). O procedimento abaixo usa **clone em pasta temporária + rsync**, preservando o `.env` existente.
4. Três segredos diferentes — não confundir:

   | Nome no `.env` | Quem define | Para que serve |
   |----------------|-------------|----------------|
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Você mesmo** (invente uma string longa e guarde em cofre) | Meta envia no GET de verificação; precisa ser **idêntico** ao que você colar no painel Meta |
   | `WHATSAPP_APP_SECRET` | **Meta** (painel do app → Configurações → Básico → Segredo do aplicativo) | Backend valida cabeçalho `X-Hub-Signature-256` no POST do webhook |
   | Token na UI **WhatsApp** (admin) | **Meta** (System User + permissões WABA) ou fluxo futuro Embedded Signup | Enviar mensagens pela Graph API (`POST /{phone-number-id}/messages`) |

---

## Se ainda não tem `WHATSAPP_APP_SECRET` nem verify token

### O verify token não vem da Meta

`WHATSAPP_WEBHOOK_VERIFY_TOKEN` é **definido por você** (ex.: 32+ caracteres aleatórios). Depois você cola **o mesmo valor** no campo "Verify token" ao configurar o webhook no Meta for Developers.

Sugestão de geração (na VPS ou no PC):

```bash
openssl rand -hex 32
```

Guarde o resultado no cofre de senhas e use como `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.

### O App Secret vem da Meta

1. Acesse [Meta for Developers](https://developers.facebook.com/).
2. Abra o **seu app** (tipo Business).
3. Menu **Configurações do app** → **Básico** → copie **Segredo do aplicativo** → use como `WHATSAPP_APP_SECRET`.

Enquanto não tiver isso, você pode **subir o código e reiniciar o backend**, mas:

- O **GET** de verificação do webhook pode falhar ou retornar 503 se `WHATSAPP_WEBHOOK_VERIFY_TOKEN` não estiver no `.env`.
- O **POST** do webhook será recusado (403) se não houver `WHATSAPP_APP_SECRET` e assinatura válida.

Ordem prática recomendada:

1. Subir backend + Apache com proxy `/webhooks/` (passos abaixo).
2. Colocar no `.env` pelo menos `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (valor que você gerou).
3. Obter `WHATSAPP_APP_SECRET` no Meta e colocar no `.env`.
4. Reiniciar `mvp-backend`.
5. No Meta: configurar Callback URL + Verify Token + assinar `messages`.
6. Na ferramenta (admin): **WhatsApp** → cadastrar WABA ID, Phone Number ID, Access Token.

---

## Parte A — Na sua máquina (antes da VPS)

Garantir que `master` (ou a branch que a VPS vai clonar) tenha o código atualizado:

```bash
cd c:\projetoferramenta
git status
git add -A
git commit -m "feat: WhatsApp Cloud API + deploy docs"
git push origin master
```

*(Se sua branch de trabalho não for `master`, faça merge para `master` antes do push ou use `--branch NOME_DA_BRANCH` no `git clone` na VPS.)*

---

## Parte B — Na VPS (SSH)

Exemplo de conexão (ajuste usuário se não for `root`):

```bash
ssh root@173.214.173.110
```

---

### B1. Clone do repositório (pasta separada — não depende de `.git` em `/opt/mvp-fluxo-backend`)

```bash
mkdir -p /opt/build
cd /opt/build
rm -rf projetoferramenta
git clone --branch master --depth 1 https://github.com/fsouzameister-dotcom/projetoferramenta.git
cd projetoferramenta && ls
```

Esperado: pastas `mvp-fluxo-backend` e `mvp-fluxo-frontend`.

---

### B2. Backup do `.env` atual do backend

```bash
cp /opt/mvp-fluxo-backend/.env /root/.env.mvp-fluxo-backend.bak.$(date +%Y%m%d_%H%M%S)
ls -la /root/.env.mvp-fluxo-backend.bak.*
```

---

### B3. Sincronizar código do backend (preserva `.env`, `node_modules`, `dist`)

```bash
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  /opt/build/projetoferramenta/mvp-fluxo-backend/ \
  /opt/mvp-fluxo-backend/
```

---

## Parte C — Passo 4 em diante: `.env` e variáveis WhatsApp

Edite o arquivo de ambiente do backend:

```bash
nano /opt/mvp-fluxo-backend/.env
```

**Acrescente** (ou ajuste) estas linhas — use valores reais quando tiver:

```bash
# Você gera (ex.: openssl rand -hex 32) — o MESMO valor vai no painel Meta como Verify token
WHATSAPP_WEBHOOK_VERIFY_TOKEN=cole_aqui_o_token_que_voce_inventou

# Copiar do Meta: App → Configurações → Básico → Segredo do aplicativo
WHATSAPP_APP_SECRET=cole_aqui_o_app_secret

# Opcional (padrão no código já é v21.0 se omitir)
# WHATSAPP_GRAPH_API_VERSION=v21.0

# NUNCA em produção — só para teste local sem validar assinatura:
# WHATSAPP_SKIP_SIGNATURE_VERIFY=true
```

Salvar no nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

**Se ainda não tiver App Secret:** pode subir o backend assim mesmo e voltar depois para editar o `.env` e reiniciar o serviço — mas o webhook POST não será aceito até existir `WHATSAPP_APP_SECRET` (salvo uso indevido de `SKIP` em dev).

---

### Instalar dependências, compilar TypeScript, reiniciar serviço

```bash
cd /opt/mvp-fluxo-backend
npm ci
npm run build
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager
```

Smoke **local** no servidor:

```bash
curl -i http://127.0.0.1:3000/health
```

Esperado: HTTP `200` e JSON com `data.status` = `ok`.

---

## Parte D — Frontend (build + publicação)

Confira onde o Apache serve o **app** (subdomínio tipo `app.clienton.com.br`). O `DocumentRoot` pode ser `/var/www/app` e **não** `/var/www/html`:

```bash
grep -R "ServerName\\|DocumentRoot" /etc/apache2/sites-enabled/
```

Build do frontend a partir do clone:

```bash
cd /opt/build/projetoferramenta/mvp-fluxo-frontend
echo 'VITE_API_URL=https://api.clienton.com.br' > .env.production
npm ci
npm run build
rsync -av --delete dist/ /var/www/app/
```

*(Troque `/var/www/app/` pelo `DocumentRoot` real do seu VirtualHost do app. Se o domínio da API for outro, troque `VITE_API_URL`.)*

---

## Parte E — Apache: expor `/webhooks/whatsapp` publicamente

Verifique se já existe proxy para webhooks:

```bash
grep -R "webhooks" /etc/apache2/sites-enabled/ 2>/dev/null || true
```

Se **não** houver `ProxyPass` para `/webhooks/`, edite o VirtualHost do host da API (ex.: `api.clienton.com.br`) e inclua **antes** ou junto dos outros `ProxyPass`:

```apache
ProxyPass        /webhooks/  http://127.0.0.1:3000/webhooks/
ProxyPassReverse /webhooks/  http://127.0.0.1:3000/webhooks/
```

Aplicar:

```bash
apachectl configtest
systemctl reload apache2
```

---

## Parte F — Testes finais (HTTPS)

```bash
curl -i https://api.clienton.com.br/health
```

Verificação Meta (substitua `SEU_TOKEN` pelo mesmo valor de `WHATSAPP_WEBHOOK_VERIFY_TOKEN`):

```bash
curl -i "https://api.clienton.com.br/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=ping"
```

Esperado: **HTTP 200** e corpo `ping`.  
Se vier **503**, o backend não encontrou `WHATSAPP_WEBHOOK_VERIFY_TOKEN` no `.env`.  
Se vier **403**, token na URL diferente do `.env` ou modo/proxy incorreto.

---

## Parte G — Meta for Developers (checklist)

1. Produto **WhatsApp** adicionado ao app.
2. **Webhook**: Callback URL `https://api.clienton.com.br/webhooks/whatsapp`, Verify token = `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
3. Assinar campo **`messages`**.
4. Anotar **WABA ID** e **Phone Number ID** do número.
5. **Access token** de longa duração (System User com acesso à WABA + permissões `whatsapp_business_messaging` e `whatsapp_business_management`).

---

## Parte H — Cadastro na ferramenta (UI)

1. Login com perfil **admin local** ou **supervisor**.
2. Menu **WhatsApp** (`/admin/whatsapp`).
3. Preencher WABA ID, Phone Number ID, Access Token (e opcionalmente display phone).
4. Testar: mensagem do celular → deve aparecer no painel do agente; resposta do agente → deve chegar no WhatsApp.

---

## Diagnóstico rápido

```bash
journalctl -u mvp-backend -n 150 --no-pager
tail -n 80 /var/log/apache2/error.log
```

403 no POST do webhook: conferir `WHATSAPP_APP_SECRET` e que o body não está sendo alterado pelo proxy (compressão/mod_security raro).

---

## Referência cruzada

- Operação geral da VPS (systemd, backup, SSL): `RUNBOOK_OPERACAO.md`
- Escopo vigente e prioridades: `DEVLOG.md` → [Escopo vigente — maio/2026](DEVLOG.md#escopo-vigente--maio2026)
- Histórico de decisões do projeto: `DEVLOG.md` (checkpoints)

---

*Documento gerado para alinhar deploy e credenciais Meta sem ambiguidade. Atualize este arquivo se o host, paths ou branch padrão mudarem.*
