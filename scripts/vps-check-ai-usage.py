#!/usr/bin/env python3
"""Consulta provedor IA e uso registrado na VPS."""
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

echo "=== PROVEDOR IA DO TENANT ==="
"${{PSQL[@]}}" -c "
SELECT provider, model, is_default, is_active, left(api_key_encrypted, 12) AS key_prefix, updated_at
FROM ai_provider_settings
WHERE tenant_id = '{TENANT}'::uuid
ORDER BY is_default DESC, created_at;
"

echo "=== USO IA (ultimas 24h) ==="
"${{PSQL[@]}}" -c "
SELECT provider, model, status, count(*) AS calls,
       coalesce(sum(request_tokens),0) AS req_tokens,
       coalesce(sum(response_tokens),0) AS res_tokens
FROM ai_usage_logs
WHERE tenant_id = '{TENANT}'::uuid
  AND created_at > now() - interval '24 hours'
GROUP BY provider, model, status
ORDER BY calls DESC;
"

echo "=== ULTIMAS 10 CHAMADAS ==="
"${{PSQL[@]}}" -c "
SELECT created_at, provider, model, status, request_tokens, response_tokens, latency_ms
FROM ai_usage_logs
WHERE tenant_id = '{TENANT}'::uuid
ORDER BY created_at DESC
LIMIT 10;
"
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=60)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
