#!/usr/bin/env python3
"""Logs Twilio/inbound recentes + rotas na VPS."""
from __future__ import annotations

import os
import sys

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("VPS_HOST", "173.214.173.110")
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")

REMOTE = r"""set -eo pipefail
echo "=== LOGS (30 min) ==="
journalctl -u mvp-backend --since "30 min ago" --no-pager \
  | grep -iE "twilio|inbound|unknown_channel|invalid_signature|handler_error|processInbound" \
  | tail -50 || true

set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL=(psql "$DATABASE_URL")
elif [ -n "${PG_HOST:-}" ] && [ -n "${PG_DATABASE:-}" ] && [ -n "${PG_USER:-}" ]; then
  export PGPASSWORD="${PG_PASSWORD:-}"
  PSQL=(psql -h "$PG_HOST" -U "$PG_USER" -d "$PG_DATABASE")
else
  export PGPASSWORD="${PG_PASSWORD:-}"
  PSQL=(psql -h "${PG_HOST:-127.0.0.1}" -U "${PG_USER:-postgres}" -d "${PG_DATABASE:-mvp_core}")
fi

echo "=== INBOUND ROUTES ==="
"${PSQL[@]}" -c "
SELECT label, source_type, source_key, active, updated_at
FROM inbound_entry_routes
ORDER BY updated_at DESC
LIMIT 8;
"

echo "=== MENSAGENS ULTIMOS 30 MIN ==="
"${PSQL[@]}" -c "
SELECT m.created_at, c.phone, m.direction,
       left(coalesce(m.text_content, m.type), 80) AS preview
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE m.created_at > now() - interval '30 minutes'
ORDER BY m.created_at DESC
LIMIT 20;
"

echo "=== INBOUND FIX DEPLOYED ==="
grep -c twilioRoutePhoneDigits /opt/mvp-fluxo-backend/dist/inbound-routes.js || echo 0
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    if not pw:
        print("Sem credencial VPS", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    stdin, stdout, stderr = client.exec_command(REMOTE, timeout=90)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err, file=sys.stderr)
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
