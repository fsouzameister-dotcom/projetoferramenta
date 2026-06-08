#!/usr/bin/env python3
import os, paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
pw = open(SECRET, encoding="utf-8").read().strip()
REMOTE = r"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
if [ -n "${DATABASE_URL:-}" ]; then PSQL=(psql "$DATABASE_URL"); else
  export PGPASSWORD="${PG_PASSWORD:-}"
  PSQL=(psql -h "${PG_HOST:-127.0.0.1}" -U "${PG_USER:-postgres}" -d "${PG_DATABASE:-mvp_core}")
fi
"${PSQL[@]}" -c "SELECT m.created_at, m.direction, left(m.text_content,90) AS txt FROM agent_messages m JOIN agent_conversations c ON c.id=m.conversation_id WHERE regexp_replace(coalesce(c.phone,''),'[^0-9]','','g')='5511992007226' ORDER BY m.created_at DESC LIMIT 8;"
"${PSQL[@]}" -c "SELECT metadata->'inbound_flow_session'->>'flowId' AS flow, metadata->'inbound_flow_session'->'awaitingInput'->>'nodeId' AS awaiting_node FROM agent_conversations WHERE regexp_replace(coalesce(phone,''),'[^0-9]','','g')='5511992007226' AND lifecycle_status='open' ORDER BY updated_at DESC LIMIT 1;"
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, _ = c.exec_command(REMOTE, timeout=60)
print(o.read().decode("utf-8", errors="replace"))
c.close()
