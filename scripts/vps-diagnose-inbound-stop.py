#!/usr/bin/env python3
"""Diagnostica por que inbound nao gerou resposta do bot."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
PHONE = "5511993597462"
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

echo "=== BOT SAFEGUARD ==="
"${{PSQL[@]}}" -c "
SELECT bot_outbound_paused, bot_outbound_pause_reason, bot_outbound_pause_source, bot_outbound_paused_at
FROM tenant_service_settings WHERE tenant_id = '{TENANT}'::uuid;
"

echo "=== ERROS 14:00-14:05 UTC ==="
journalctl -u mvp-backend --since '2026-06-05 14:00:00' --until '2026-06-05 14:05:00' --no-pager 2>/dev/null | grep -iE 'error|warn|level.:40|level.:50|inbound|truncado|circuit|paused|execution' | tail -n 40 || echo '(sem logs)'

echo "=== REDIS SESSION ==="
KEY="inbound:flow:session:{TENANT}:phone:{PHONE}"
if command -v redis-cli >/dev/null 2>&1; then
  if [ -n "${{REDIS_URL:-}}" ]; then
    redis-cli -u "$REDIS_URL" GET "$KEY" | head -c 2000
    echo ""
  else
    redis-cli GET "$KEY" | head -c 2000
    echo ""
  fi
else
  echo "redis-cli ausente"
fi

echo "=== AI USAGE ERROS 14:00+ ==="
"${{PSQL[@]}}" -c "
SELECT created_at, status, error_code, model, latency_ms
FROM ai_usage_logs
WHERE tenant_id = '{TENANT}'::uuid AND created_at > '2026-06-05 14:00:00+00'
ORDER BY created_at DESC LIMIT 10;
"
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
