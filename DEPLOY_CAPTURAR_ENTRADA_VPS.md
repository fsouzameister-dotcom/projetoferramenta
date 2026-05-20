# Deploy — Capturar Entrada (multi-escolha) + Relatórios na VPS

Roteiro para publicar o commit `feat: capturar_entrada multi-escolha com eventos para relatorios` em produção.

Repo: `https://github.com/fsouzameister-dotcom/projetoferramenta.git` (branch `master`)

---

## Parte A — Na sua máquina (já feito se `git push` retornou OK)

```powershell
cd c:\projetoferramenta
git log -1 --oneline
git push origin master
```

Esperado: commit `2b47404` (ou posterior) em `origin/master`.

---

## Parte B — Conectar na VPS

```bash
ssh root@173.214.173.110
```

*(Ajuste usuário/IP se o seu ambiente for outro.)*

---

## Parte C — Atualizar código (clone em `/opt/build`)

```bash
mkdir -p /opt/build
cd /opt/build
rm -rf projetoferramenta
git clone --branch master --depth 1 https://github.com/fsouzameister-dotcom/projetoferramenta.git
cd projetoferramenta
git log -1 --oneline
```

Confirme que o log mostra a mensagem com `capturar_entrada` / `relatorios`.

---

## Parte D — Backend

### D1. Backup do `.env`

```bash
cp /opt/mvp-fluxo-backend/.env /root/.env.mvp-fluxo-backend.bak.$(date +%Y%m%d_%H%M%S)
```

### D2. Sincronizar código (preserva `.env` e `node_modules`)

```bash
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  /opt/build/projetoferramenta/mvp-fluxo-backend/ \
  /opt/mvp-fluxo-backend/
```

### D3. Build e restart

```bash
cd /opt/mvp-fluxo-backend
npm ci
npm run build
systemctl restart mvp-backend
systemctl status mvp-backend --no-pager
```

### D4. Smoke local

```bash
curl -sS http://127.0.0.1:3000/health
curl -sS https://api.clienton.com.br/health
```

---

## Parte E — Frontend

Confirme o `DocumentRoot` do app:

```bash
grep -R "ServerName\|DocumentRoot" /etc/apache2/sites-enabled/
```

Build e publicação (ajuste o destino se não for `/var/www/app/`):

```bash
cd /opt/build/projetoferramenta/mvp-fluxo-frontend
printf '%s\n' 'VITE_API_URL=https://api.clienton.com.br' 'VITE_AGENT_DATA_MODE=api' > .env.production
npm ci
npm run build
rsync -av --delete dist/ /var/www/app/
```

---

## Parte F — Banco (automático)

**Não rode SQL manual.** Na primeira execução com resposta gravada ou na primeira abertura de **Relatórios**, o backend cria:

- Tabela `flow_response_events`
- Índices em `tenant_id`, `flow_id`, `question_key`

Para conferir após um teste:

```bash
docker exec -it $(docker ps -qf name=postgres) psql -U postgres -d mvp_core -c "\d flow_response_events"
```

*(Ajuste container/usuário/banco conforme seu `docker-compose`.)*

---

## Parte G — Validação funcional

### G1. Pela UI (admin)

1. Acesse `https://app.clienton.com.br` → login **admin** ou **supervisor**.
2. **Fluxos** → abra um fluxo → adicione ou edite node **Capturar Entrada**.
3. Configure:
   - Modo: **Várias opções**
   - Máximo: **3**
   - Opções com `id` + rótulo
   - `promptKey` (ex.: `interesses_produto`)
   - **Próximo node** (ID do node seguinte)
4. Salve o node e o fluxo.
5. Menu **Relatórios** (`/reports`) — deve abrir sem 404.

### G2. Pela API (com JWT + `x-tenant-id`)

**Passo 1 — pausa aguardando resposta:**

```http
POST https://api.clienton.com.br/api/flows/{flowId}/execute
Authorization: Bearer {JWT}
x-tenant-id: {tenant_uuid}

{}
```

Resposta esperada: `"status": "awaiting_input"` e objeto `awaitingInput`.

**Passo 2 — enviar escolhas (até 3):**

```http
POST https://api.clienton.com.br/api/flows/{flowId}/execute
Authorization: Bearer {JWT}
x-tenant-id: {tenant_uuid}

{
  "startNodeId": "{id-do-node-capturar}",
  "userInput": ["opcao_1", "opcao_2"]
}
```

Resposta esperada: `"status": "completed"` (ou continuação do fluxo) e variáveis preenchidas.

**Relatórios:**

```http
GET https://api.clienton.com.br/api/reports/flow-responses/aggregates?flowId={flowId}
GET https://api.clienton.com.br/api/reports/flow-responses?flowId={flowId}&limit=20
```

---

## Parte H — Diagnóstico

```bash
journalctl -u mvp-backend -n 120 --no-pager
```

| Sintoma | Ação |
|---------|------|
| 404 em `/reports` | Frontend antigo — refazer build + `rsync` para `/var/www/app/` |
| 403 em `/api/reports/*` | Usar token de admin/supervisor, não agente |
| Relatório vazio | Executar passo G2 completo (com `userInput`) |
| `awaiting_input` não avança | `startNodeId` deve ser o `currentNodeId` da resposta anterior |
| Erro 400 opção inválida | `userInput` deve usar `id` das opções configuradas no node |

---

## Referências

- `RUNBOOK_OPERACAO.md` — operação geral (systemd, logs, backup)
- `DEVLOG.md` — checkpoint 2026-05-20
- `DOCUMENTO_NODES_FLUXO.md` — contrato do node `capturar_entrada`
- `DEPLOY_WHATSAPP_VPS_COMPLETO.md` — deploy WhatsApp (independente desta entrega)

---

*Atualize IP, paths e domínios se o ambiente de produção mudar.*
