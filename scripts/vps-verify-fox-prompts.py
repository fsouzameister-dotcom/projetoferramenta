#!/usr/bin/env python3
import os, paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pw = open(os.path.join(os.path.dirname(__file__), ".vps-deploy-secret"), encoding="utf-8").read().strip()
REMOTE = """set -eo pipefail
set -a; source /opt/mvp-fluxo-backend/.env; set +a
if [ -n "${DATABASE_URL:-}" ]; then PSQL=(psql "$DATABASE_URL")
else
  export PGPASSWORD="${PG_PASSWORD:-}"
  PSQL=(psql -h "${PG_HOST:-127.0.0.1}" -U "${PG_USER:-postgres}" -d "${PG_DATABASE:-mvp_core}")
fi
"${PSQL[@]}" -c "
SELECT name, left(coalesce(config->>'content', config->>'prompt', ''), 90) AS texto
FROM nodes
WHERE flow_id = '37dc75e1-742f-4f22-8d34-93dfaa0a66c1'::uuid
  AND name IN ('Celular', 'Data nascimento', 'CPF', 'Nasc. filho(a)')
ORDER BY name;
"
"""
c = paramiko.SSHClient(); c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, _ = c.exec_command(REMOTE, timeout=60)
print(o.read().decode("utf-8", errors="replace"))
c.close()
