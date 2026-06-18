#!/usr/bin/env python3
"""Lista rotas inbound na VPS e aplica seed Cleo inbound."""
from __future__ import annotations

import os
import sys

import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
BACKEND = "/opt/mvp-fluxo-backend"


def password() -> str:
    env = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if env:
        return env
    if os.path.isfile(SECRET):
        return open(SECRET, encoding="utf-8").read().strip()
    return ""


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 300) -> int:
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out:
        sys.stdout.buffer.write(out.encode("utf-8", errors="replace"))
        if not out.endswith("\n"):
            sys.stdout.buffer.write(b"\n")
    if err:
        sys.stderr.buffer.write(err.encode("utf-8", errors="replace"))
        if not err.endswith("\n"):
            sys.stderr.buffer.write(b"\n")
    return code


def main() -> int:
    pwd = password()
    if not pwd:
        print("Sem VPS_ROOT_PASSWORD / .vps-deploy-secret", file=sys.stderr)
        return 2

    local_seed = os.path.join(
        os.path.dirname(__file__), "..", "mvp-fluxo-backend", "scripts", "seed-cleo-inbound-routes.ts"
    )
    local_seed = os.path.normpath(local_seed)

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pwd, timeout=30)

    sftp = client.open_sftp()
    sftp.put(local_seed, f"{BACKEND}/scripts/seed-cleo-inbound-routes.ts")
    sftp.close()

    print("=== Rotas inbound (antes) ===")
    run(
        client,
        rf"""set -a && source {BACKEND}/.env && set +a
if [ -n "${{DATABASE_URL:-}}" ]; then PSQL=(psql "$DATABASE_URL"); else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi
"${{PSQL[@]}}" -c "
SELECT r.label, r.source_type, r.source_key, f.name AS flow_name, r.active,
       r.metadata->'message_triggers' AS triggers
FROM inbound_entry_routes r
JOIN flows f ON f.id = r.flow_id
ORDER BY r.updated_at DESC;
"
""",
    )

    print("\n=== Aplicando seed Cleo inbound ===")
    code = run(client, f"cd {BACKEND} && npx tsx scripts/seed-cleo-inbound-routes.ts", timeout=120)
    if code != 0:
        client.close()
        return code

    print("\n=== Rotas inbound (depois) ===")
    run(
        client,
        rf"""set -a && source {BACKEND}/.env && set +a
if [ -n "${{DATABASE_URL:-}}" ]; then PSQL=(psql "$DATABASE_URL"); else
  export PGPASSWORD="${{PG_PASSWORD:-}}"
  PSQL=(psql -h "${{PG_HOST:-127.0.0.1}}" -U "${{PG_USER:-postgres}}" -d "${{PG_DATABASE:-mvp_core}}")
fi
"${{PSQL[@]}}" -c "
SELECT r.label, r.source_key, f.name AS flow_name, r.metadata->'message_triggers' AS triggers
FROM inbound_entry_routes r
JOIN flows f ON f.id = r.flow_id
WHERE r.source_type = 'twilio_whatsapp'
ORDER BY r.updated_at DESC;
"
""",
    )
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
