#!/usr/bin/env python3
"""Inspeciona nodes e tabulacoes do Fluxo Cleo na VPS."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")

REMOTE = r"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${PG_PASSWORD:-}"
  PSQL=(psql -h "${PG_HOST:-127.0.0.1}" -U "${PG_USER:-postgres}" -d "${PG_DATABASE:-mvp_core}")
fi

FLOW_ID=$("${PSQL[@]}" -t -A -c "SELECT id FROM flows WHERE lower(name) LIKE '%cleo%' LIMIT 1;")
echo "flow_id=$FLOW_ID"

if [ -n "$FLOW_ID" ]; then
  echo "=== NODES (tipo, nome, config resumida) ==="
  "${PSQL[@]}" -c "
  SELECT type, name, is_start,
         left(config::text, 200) AS config_preview
  FROM nodes WHERE flow_id = '$FLOW_ID'::uuid
  ORDER BY name;
  "
  echo "=== AI SETTINGS ==="
  "${PSQL[@]}" -c "
  SELECT ai_settings::text FROM flows WHERE id = '$FLOW_ID'::uuid;
  " 2>/dev/null || echo "(sem ai_settings)"
fi

echo "=== TABULACOES DO TENANT ==="
"${PSQL[@]}" -c "
SELECT id, key, label, active, queue_ids
FROM tabulacoes
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
ORDER BY label;
" 2>/dev/null || "${PSQL[@]}" -c "
SELECT id, key, label, active
FROM tabulacoes
ORDER BY label LIMIT 10;
"

echo "=== SERVICE SETTINGS (closure template) ==="
"${PSQL[@]}" -c "
SELECT left(closure_message_template, 120) AS closure_tpl
FROM tenant_service_settings
WHERE tenant_id = '00000000-0000-4000-8000-000000000001';
"
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    stdin, stdout, stderr = client.exec_command(REMOTE, timeout=90)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    print(out)
    if err.strip():
        print("stderr:", err)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
