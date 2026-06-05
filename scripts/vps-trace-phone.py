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
  exit 1
fi
PHONE='{PHONE_DIGITS}'
echo '=== CONVERSAS (phone ~ %PHONE%) ==='
"${{PSQL[@]}}" -x -c "
SELECT id, tenant_id, contact_name, phone, status, lifecycle_status,
       closed_at, closed_by, last_customer_message_at, window_expires_at,
       protocol_number, tabulacao_label, closure_message_status, updated_at,
       left(metadata::text, 200) AS metadata_preview
FROM agent_conversations
WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
ORDER BY updated_at DESC
LIMIT 5;
"
echo '=== ULTIMAS MENSAGENS (40) ==='
"${{PSQL[@]}}" -c "
SELECT m.created_at, m.direction, m.delivery_status,
       left(coalesce(m.text_content, m.type), 120) AS preview,
       m.provider_message_id,
       m.sender_name
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
ORDER BY m.created_at DESC
LIMIT 40;
"
echo '=== BURST OUTBOUND (mesmo segundo, >1 msg) ==='
"${{PSQL[@]}}" -c "
SELECT date_trunc('second', m.created_at) AS ts, count(*) AS n,
       array_agg(left(m.text_content, 80) ORDER BY m.created_at) AS previews
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
  AND m.direction = 'out'
  AND m.created_at > now() - interval '48 hours'
GROUP BY 1
HAVING count(*) > 1
ORDER BY ts DESC
LIMIT 20;
"
echo '=== DUPLICATAS EXATAS (texto igual, 48h) ==='
"${{PSQL[@]}}" -c "
SELECT left(m.text_content, 100) AS preview, count(*) AS n,
       min(m.created_at) AS first_at, max(m.created_at) AS last_at
FROM agent_messages m
JOIN agent_conversations c ON c.id = m.conversation_id
WHERE regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') LIKE '%' || '$PHONE' || '%'
  AND m.direction = 'out'
  AND m.created_at > now() - interval '48 hours'
  AND coalesce(m.text_content, '') <> ''
GROUP BY m.text_content
HAVING count(*) > 1
ORDER BY n DESC, last_at DESC
LIMIT 15;
"
echo '=== LOGS TWILIO INBOUND (2h) ==='
journalctl -u mvp-backend --since '2 hours ago' --no-pager 2>/dev/null | grep -i twilio | grep -i messages | tail -n 30 || echo '(sem journal)'
"""

    stdin, stdout, stderr = client.exec_command(remote_script, timeout=120)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    print(out)
    if err.strip():
        print("stderr:", err)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
