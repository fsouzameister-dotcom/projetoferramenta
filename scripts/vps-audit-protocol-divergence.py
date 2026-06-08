#!/usr/bin/env python3
"""Auditoria: telefones com múltiplas conversas/protocolos."""
from __future__ import annotations

import os
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
TENANT = "00000000-0000-4000-8000-000000000001"

REMOTE = f"""set -eo pipefail
set -a; source /opt/mvp-fluxo-backend/.env; set +a
if [ -n "${{DATABASE_URL:-}}" ]; then PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi

echo "=== TELEFONES COM MAIS DE 1 CONVERSA ==="
"${{PSQL[@]}}" -c "
SELECT regexp_replace(coalesce(phone,''),'[^0-9]','','g') AS phone_digits,
       count(*) AS conv_count,
       count(DISTINCT protocol_number) FILTER (WHERE protocol_number IS NOT NULL) AS protocol_count,
       array_agg(DISTINCT lifecycle_status) AS lifecycles,
       array_agg(DISTINCT COALESCE(metadata->>'bot_only','false')) AS bot_only_flags
FROM agent_conversations
WHERE tenant_id = '{TENANT}'::uuid
  AND coalesce(phone,'') <> ''
GROUP BY 1
HAVING count(*) > 1
ORDER BY conv_count DESC
LIMIT 15;
"

echo "=== CONVERSAS FECHADAS COM MENSAGEM INBOUND RECENTE ==="
"${{PSQL[@]}}" -c "
SELECT c.id, c.lifecycle_status, c.protocol_number,
       c.closed_at, c.updated_at,
       COALESCE(c.metadata->>'bot_only','false') AS bot_only,
       (SELECT max(m.created_at) FROM agent_messages m WHERE m.conversation_id = c.id AND m.direction = 'in') AS last_in
FROM agent_conversations c
WHERE c.tenant_id = '{TENANT}'::uuid
  AND c.lifecycle_status IN ('closed_manual','closed_window')
  AND EXISTS (
    SELECT 1 FROM agent_messages m
    WHERE m.conversation_id = c.id AND m.direction = 'in'
      AND m.created_at > coalesce(c.closed_at, c.updated_at) - interval '1 hour'
  )
ORDER BY c.updated_at DESC
LIMIT 10;
"
"""

pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, _ = c.exec_command(REMOTE, timeout=90)
print(o.read().decode("utf-8", errors="replace"))
c.close()
