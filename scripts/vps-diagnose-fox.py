#!/usr/bin/env python3
"""Diagnostica Fox inbound para um telefone."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
PHONE = os.environ.get("DIAG_PHONE", "5511992007226")
TENANT = "00000000-0000-4000-8000-000000000001"

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

echo "=== CONVERSAS PHONE {PHONE} ==="
"${{PSQL[@]}}" -c "
SELECT id, status, lifecycle_status,
       coalesce(metadata->>'bot_only','false') AS bot_only,
       coalesce(metadata->>'flowHandoff','false') AS handoff,
       tags, protocol_number, updated_at
FROM agent_conversations
WHERE tenant_id = '{TENANT}'::uuid
  AND regexp_replace(coalesce(phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY updated_at DESC LIMIT 5;
"

echo "=== ULTIMAS MENSAGENS ==="
"${{PSQL[@]}}" -c "
SELECT m.created_at, m.direction, m.sender_name, left(m.text_content,80) AS txt,
       c.id AS conv_id, coalesce(c.metadata->>'bot_only','false') AS bot_only
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE m.tenant_id = '{TENANT}'::uuid
  AND regexp_replace(coalesce(c.phone,''),'[^0-9]','','g') = '{PHONE}'
ORDER BY m.created_at DESC LIMIT 10;
"

echo "=== ROTAS INBOUND ==="
"${{PSQL[@]}}" -c "
SELECT id, label, source_type, source_key, flow_id, active, metadata
FROM inbound_entry_routes
WHERE tenant_id = '{TENANT}'::uuid
ORDER BY updated_at DESC;
"

echo "=== BOT SAFEGUARD ==="
"${{PSQL[@]}}" -c "
SELECT bot_outbound_paused, bot_outbound_pause_reason
FROM tenant_service_settings WHERE tenant_id = '{TENANT}'::uuid;
"

echo "=== FOX FLOW ==="
"${{PSQL[@]}}" -c "
SELECT f.id, f.name, f.is_active, count(n.id) AS nodes,
       sum(CASE WHEN n.is_start THEN 1 ELSE 0 END) AS starts
FROM flows f
LEFT JOIN nodes n ON n.flow_id = f.id
WHERE f.tenant_id = '{TENANT}'::uuid AND lower(f.name) LIKE '%fox%'
GROUP BY f.id, f.name, f.is_active;
"

echo "=== REDIS SESSION ==="
KEY="inbound:flow:session:{TENANT}:phone:{PHONE}"
if command -v redis-cli >/dev/null 2>&1; then
  if [ -n "${{REDIS_URL:-}}" ]; then redis-cli -u "$REDIS_URL" GET "$KEY"; else redis-cli GET "$KEY"; fi
  echo ""
else echo "redis-cli ausente"; fi

echo "=== FOX START NODE ==="
"${{PSQL[@]}}" -c "
SELECT n.id, n.type, n.name, n.is_start, n.config->>'next_node_id' AS next_id
FROM nodes n
JOIN flows f ON f.id = n.flow_id
WHERE f.id = '37dc75e1-742f-4f22-8d34-93dfaa0a66c1'::uuid
  AND (n.is_start OR n.name = 'Abertura')
ORDER BY n.is_start DESC;
"

echo "=== LOGS 18:31 UTC ==="
journalctl -u mvp-backend --since '2026-06-05 18:30:00' --until '2026-06-05 18:35:00' --no-pager 2>/dev/null | tail -n 40 || echo '(sem logs)'
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=90)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
