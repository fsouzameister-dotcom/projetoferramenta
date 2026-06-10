#!/usr/bin/env python3
"""Consulta nodes iniciais do Fox na VPS."""
from __future__ import annotations

import os
import sys
import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
FLOW = "37dc75e1-742f-4f22-8d34-93dfaa0a66c1"

REMOTE = f"""set -eo pipefail
set -a && source /opt/mvp-fluxo-backend/.env && set +a
if [ -n "${{DATABASE_URL:-}}" ]; then
  PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi
echo "=== NODES INICIO FOX ==="
"${{PSQL[@]}}" -c "
SELECT n.id, n.name, n.type, n.is_start,
       n.config->>'next_node_id' AS next_id,
       n.config->'options' AS options,
       left(n.config->>'prompt', 120) AS prompt,
       left(n.config->>'content', 120) AS content
FROM nodes n
WHERE n.flow_id = '{FLOW}'::uuid
  AND (
    n.is_start
    OR n.id IN (
      'b2000002-0001-4002-8001-000000000002',
      'b2000003-0001-4003-8001-000000000003',
      'b2000006-0001-4006-8001-000000000006',
      'b2000004-0001-4004-8001-000000000004',
      'b2000005-0001-4005-8001-000000000005'
    )
  )
ORDER BY n.name;
"
echo "=== DECISAO Cadastrar? CONFIG ==="
"${{PSQL[@]}}" -c "
SELECT config FROM nodes WHERE id = 'b2000006-0001-4006-8001-000000000006';
"
echo "=== NODE ORFAO ABERTURA ==="
"${{PSQL[@]}}" -c "
SELECT id, name, type, config->>'next_node_id' AS next_id
FROM nodes WHERE id = '6e184b39-750f-4fa6-9144-952980b0082f';
"
echo "=== ROTA INBOUND FOX ==="
"${{PSQL[@]}}" -c "
SELECT label, source_type, source_key, active, metadata
FROM inbound_entry_routes
WHERE flow_id = '{FLOW}'::uuid;
"
"""


def main() -> int:
    pw = open(SECRET, encoding="utf-8").read().strip()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pw, timeout=30)
    _, o, e = c.exec_command(REMOTE, timeout=60)
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    c.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
