#!/usr/bin/env python3
"""Inspeciona Fluxo Cleo + erros recentes na VPS."""
from __future__ import annotations

import os
import sys

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

echo "=== FLUXO CLEO ==="
"${PSQL[@]}" -c "
SELECT f.id, f.name, f.channel
FROM flows f
WHERE lower(f.name) LIKE '%cleo%'
ORDER BY f.name;
"

FLOW_ID=$("${PSQL[@]}" -t -A -c "
SELECT f.id FROM flows f WHERE lower(f.name) LIKE '%cleo%' LIMIT 1;
")
echo "flow_id=$FLOW_ID"

if [ -n "$FLOW_ID" ]; then
  echo "=== NODES ==="
  "${PSQL[@]}" -c "
  SELECT id, type, name, is_start, left(config::text, 120) AS config_preview
  FROM nodes WHERE flow_id = '$FLOW_ID'::uuid
  ORDER BY is_start DESC, name;
  "
  echo "=== AI SETTINGS ==="
  "${PSQL[@]}" -c "
  SELECT flow_id, persona_id, execution_mode, left(system_prompt_override, 80) AS prompt
  FROM flow_ai_settings WHERE flow_id = '$FLOW_ID'::uuid;
  " 2>/dev/null || echo "(sem tabela flow_ai_settings ou vazio)"
fi

echo "=== ERROS LOG (2h) ==="
journalctl -u mvp-backend --since "2 hours ago" --no-pager -p err..alert | tail -30 || true
journalctl -u mvp-backend --since "2 hours ago" --no-pager | grep -iE "error|FLOW_EXECUTION|guardrail|persona|twilio_messages_handler" | tail -30 || true

echo "=== REDIS SESSION (phone 11992007226) ==="
redis-cli KEYS 'inbound:flow:session:*11992007226*' 2>/dev/null || echo "redis indisponivel"
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    stdin, stdout, stderr = client.exec_command(REMOTE, timeout=90)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err, file=sys.stderr)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
