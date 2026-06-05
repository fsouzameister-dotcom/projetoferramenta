#!/usr/bin/env python3
"""Consulta conversa/mensagens na VPS por telefone (somente leitura)."""
from __future__ import annotations

import os
import sys

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PHONE_DIGITS = sys.argv[1] if len(sys.argv) > 1 else "11992007226"
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")


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

    remote_script = f"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${{DATABASE_URL:-}}" ]; then
  PSQL=(psql "$DATABASE_URL")
elif [ -n "${{PG_HOST:-}}" ] && [ -n "${{PG_DATABASE:-}}" ] && [ -n "${{PG_USER:-}}" ]; then
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "$PG_HOST" -U "$PG_USER" -d "$PG_DATABASE")
elif [ -n "${{DB_HOST:-}}" ] && [ -n "${{DB_NAME:-}}" ] && [ -n "${{DB_USER:-}}" ]; then
  export PGPASSWORD="${{DB_PASSWORD:-}}"
  PSQL=(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME")
else
  echo 'WARN: tentando socket local com PG_DATABASE do .env'
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi
if ! "${{PSQL[@]}}" -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'ERRO: nao conectou ao postgres'
  grep -E '^[A-Z_]+=' /opt/mvp-fluxo-backend/.env | cut -d= -f1 | head -20
  exit 1
fi
PHONE='{PHONE_DIGITS}'
echo '=== CONVERSAS (phone ~ %PHONE%) ==='
"${{PSQL[@]}}" -x -c "
SELECT id, tenant_id, contact_name, phone, status, lifecycle_status,
       closed_at, closed_by, last_customer_message_at, window_expires_at,
       protocol_number, tabulacao_label, closure_message_status, updated_at,
       metadata::text
FROM agent_conversations
WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
ORDER BY updated_at DESC
LIMIT 5;
"
echo '=== ULTIMAS MENSAGENS ==='
"${{PSQL[@]}}" -c "
SELECT m.created_at, m.direction, m.delivery_status,
       left(coalesce(m.text_content, m.type), 100) AS preview,
       m.sender_name
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
ORDER BY m.created_at DESC
LIMIT 12;
"
echo '=== STATUS AGRUPADO (este telefone) ==='
"${{PSQL[@]}}" -c "
SELECT status, lifecycle_status, count(*) AS n
FROM agent_conversations
WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
GROUP BY status, lifecycle_status
ORDER BY n DESC;
"
echo '=== CONVERSAS em_espera AGORA (qualquer telefone, tenant dev) ==='
"${{PSQL[@]}}" -c "
SELECT phone, contact_name, status, lifecycle_status, updated_at
FROM agent_conversations
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
  AND status = 'em_espera'
ORDER BY updated_at DESC
LIMIT 8;
"
echo '=== DEPLOY (fix isClosedLifecycle) ==='
if grep -q isClosedLifecycle /opt/mvp-fluxo-backend/dist/agent-conversations.js 2>/dev/null; then
  echo 'fix_present=yes'
else
  echo 'fix_present=no'
fi
ls -la /opt/mvp-fluxo-backend/dist/agent-conversations.js 2>/dev/null | head -1
"""

    stdin, stdout, stderr = client.exec_command("bash -s", timeout=90)
    stdin.write(remote_script)
    stdin.channel.shutdown_write()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    client.close()
    print(out)
    if err.strip():
        print("stderr:", err, file=sys.stderr)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
