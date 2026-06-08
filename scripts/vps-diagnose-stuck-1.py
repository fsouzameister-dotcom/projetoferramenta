#!/usr/bin/env python3
"""Diagnostica travamento apos resposta '1' no fluxo Fox."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
PHONE = os.environ.get("DIAG_PHONE", "5511992007226")
TENANT = "00000000-0000-4000-8000-000000000001"
CAP_ID = "b2000003-0001-4003-8001-000000000003"

REMOTE = f"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${{DATABASE_URL:-}}" ]; then
  PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi

echo "=== CONVERSA ABERTA ==="
"${{PSQL[@]}}" -c "
SELECT id, status, lifecycle_status,
       coalesce(metadata->>'bot_only','false') AS bot_only,
       tags, updated_at
FROM agent_conversations
WHERE tenant_id = '{TENANT}'::uuid
  AND lifecycle_status = 'open'
  AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY updated_at DESC LIMIT 3;
"

echo "=== ULTIMAS 20 MENSAGENS ==="
"${{PSQL[@]}}" -c "
SELECT m.created_at, m.direction, m.sender_name, left(m.text_content,120) AS txt
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE m.tenant_id = '{TENANT}'::uuid
  AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY m.created_at DESC LIMIT 20;
"

echo "=== REDIS SESSION ==="
KEY="inbound:flow:session:{TENANT}:phone:{PHONE}"
if command -v redis-cli >/dev/null 2>&1; then
  if [ -n "${{REDIS_URL:-}}" ]; then redis-cli -u "$REDIS_URL" GET "$KEY"; else redis-cli GET "$KEY"; fi
  echo ""
fi

echo "=== ROTAS ==="
"${{PSQL[@]}}" -c "
SELECT label, source_key, flow_id, active, metadata->'message_triggers' AS triggers
FROM inbound_entry_routes
WHERE tenant_id = '{TENANT}'::uuid AND active
ORDER BY updated_at DESC;
"

echo "=== DEC + MSG_NOME ==="
"${{PSQL[@]}}" -c "
SELECT id, name, type,
       config->>'next_node_id' AS next,
       config->>'next_node_id_true' AS next_true,
       left(coalesce(config->>'content',''),80) AS content
FROM nodes
WHERE id IN (
  'b2000006-0001-4006-8001-000000000006',
  'b2000040-0001-4040-8001-000000000040',
  'b2000010-0001-4010-8001-000000000010'
);
"

echo "=== SIMULAR RESUME '1' NO CAP_CADASTRAR ==="
cd /opt/mvp-fluxo-backend
npx tsx -e "
import {{ executeFlow }} from './src/flow-executor.ts';
import {{ pool }} from './src/db.ts';

const FLOW = '37dc75e1-742f-4f22-8d34-93dfaa0a66c1';
const TENANT = '{TENANT}';
const CAP = '{CAP_ID}';

const r1 = await executeFlow(FLOW, TENANT, {{
  userInput: 'cadastrar-se',
  phone: '+55{PHONE}',
  sessionId: 'diag:fox:1',
}});
console.log('step1 status', r1.status, 'awaiting', r1.awaitingInput?.nodeId);
console.log('step1 msgs', r1.messages?.length, 'outbound', r1.outboundMessages?.length);
console.log('step1 last', (r1.messages?.at(-1) ?? '').slice(0, 80));

if (r1.status !== 'awaiting_input' || !r1.awaitingInput) {{
  console.log('ABORT: step1 not awaiting');
  await pool.end();
  process.exit(0);
}}

const r2 = await executeFlow(FLOW, TENANT, {{
  startNodeId: r1.awaitingInput.nodeId,
  userInput: '1',
  variables: r1.variables,
  phone: '+55{PHONE}',
  sessionId: 'diag:fox:1',
  awaitingStartedAt: r1.awaitingInput.awaitingStartedAt,
  resumeReason: 'input',
}});
console.log('step2 status', r2.status, 'awaiting', r2.awaitingInput?.nodeId);
console.log('step2 msgs', r2.messages?.length, 'outbound', r2.outboundMessages?.length);
for (const m of r2.messages ?? []) console.log(' msg:', m.slice(0, 100));
for (const o of r2.outboundMessages ?? []) console.log(' out:', o.body?.slice(0, 100));
console.log('quer_cadastrar', r2.variables?.quer_cadastrar);
await pool.end();
"

echo "=== LOGS 30min ==="
journalctl -u mvp-backend --since '30 min ago' --no-pager 2>/dev/null | grep -iE 'inbound|outbound|truncado|guard|5511992007226|error' | tail -n 30 || true
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=180)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
