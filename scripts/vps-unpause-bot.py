#!/usr/bin/env python3
"""Reativa envios do bot (tenant dev)."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
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
"${{PSQL[@]}}" -c "
UPDATE tenant_service_settings
SET bot_outbound_paused = false,
    bot_outbound_pause_reason = NULL,
    bot_outbound_paused_at = NULL,
    bot_outbound_pause_source = NULL,
    updated_at = now()
WHERE tenant_id = '{TENANT}'::uuid;
"
"${{PSQL[@]}}" -c "
SELECT bot_outbound_paused, bot_outbound_pause_reason FROM tenant_service_settings
WHERE tenant_id = '{TENANT}'::uuid;
"
echo BOT_UNPAUSED_OK
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=30)
    print(stdout.read().decode("utf-8", errors="replace"))
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
