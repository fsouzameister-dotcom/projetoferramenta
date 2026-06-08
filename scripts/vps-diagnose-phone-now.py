#!/usr/bin/env python3
"""Diagnóstico em tempo real de um contato no fluxo Fox."""
from __future__ import annotations

import os
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
PHONE = "5511992007226"
TENANT = "00000000-0000-4000-8000-000000000001"

REMOTE = f"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${{DATABASE_URL:-}}" ]; then PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi

echo "=== CONVERSA ABERTA ==="
"${{PSQL[@]}}" -c "
SELECT id, status, lifecycle_status,
       coalesce(metadata->>'bot_only','false') AS bot_only,
       metadata->'inbound_flow_session'->'awaitingInput'->>'nodeId' AS awaiting_node,
       metadata->'inbound_flow_session'->>'flowId' AS flow_id,
       updated_at
FROM agent_conversations
WHERE tenant_id = '{TENANT}'::uuid
  AND lifecycle_status = 'open'
  AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY updated_at DESC LIMIT 3;
"

echo "=== ULTIMAS 12 MENSAGENS ==="
"${{PSQL[@]}}" -c "
SELECT m.created_at, m.direction, m.sender_name, left(m.text_content,120) AS txt
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE m.tenant_id = '{TENANT}'::uuid
  AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY m.created_at DESC LIMIT 12;
"

echo "=== REDIS SESSION ==="
KEY="inbound:flow:session:{TENANT}:phone:{PHONE}"
if command -v redis-cli >/dev/null 2>&1; then
  if [ -n "${{REDIS_URL:-}}" ]; then redis-cli -u "$REDIS_URL" GET "$KEY"
  else redis-cli GET "$KEY"; fi
  echo ""
fi

echo "=== NODE RENDA (msg + recv) ==="
"${{PSQL[@]}}" -c "
SELECT id, name, type,
       left(coalesce(config->>'content',''),80) AS content,
       config->>'next_node_id' AS next,
       config->>'validation_type' AS validation
FROM nodes
WHERE id IN (
  'b2000051-0001-4051-8001-000000000051',
  'b200002a-0001-402a-8001-00000000002a'
);
"

echo "=== ULTIMOS EVENTOS RESPOSTA (renda) ==="
"${{PSQL[@]}}" -c "
SELECT created_at, question_key, variable_name, raw_value, left(prompt_text,60) AS prompt
FROM flow_response_events
WHERE tenant_id = '{TENANT}'::uuid
  AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY created_at DESC LIMIT 8;
"

echo "=== BOT SAFEGUARD ==="
"${{PSQL[@]}}" -c "
SELECT bot_outbound_paused, bot_outbound_pause_reason
FROM tenant_service_settings WHERE tenant_id = '{TENANT}'::uuid;
"

echo "=== LOGS 15min (renda/5511992007226/error) ==="
journalctl -u mvp-backend --since '15 min ago' --no-pager 2>/dev/null | grep -iE '5511992007226|renda|validation|inbound|error|truncado' | tail -n 25 || true
"""

pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=90)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("stderr:", err)
c.close()
