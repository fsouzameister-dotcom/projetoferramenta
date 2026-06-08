#!/usr/bin/env python3
"""Remove sessão Redis do fluxo inbound para um telefone (reinicia o bot)."""
from __future__ import annotations

import os
import sys

import paramiko

HOST = os.environ.get("VPS_HOST", "173.214.173.110")
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
TENANT = os.environ.get(
    "DEFAULT_LOGIN_TENANT_ID", "00000000-0000-4000-8000-000000000001"
)
PHONE = sys.argv[1] if len(sys.argv) > 1 else "5511992007226"
DIGITS = "".join(ch for ch in PHONE if ch.isdigit())

REMOTE = f"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
KEY="inbound:flow:session:{TENANT}:phone:{DIGITS}"
if command -v redis-cli >/dev/null 2>&1; then
  if [ -n "${{REDIS_URL:-}}" ]; then
    redis-cli -u "$REDIS_URL" DEL "$KEY"
  else
    redis-cli DEL "$KEY"
  fi
  echo "Sessão removida: $KEY"
else
  cd /opt/mvp-fluxo-backend
  node <<'NODE'
const Redis = require("ioredis");
const key = "inbound:flow:session:{TENANT}:phone:{DIGITS}";
const url = process.env.REDIS_URL;
const client = url
  ? new Redis(url)
  : new Redis({{
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT || 6379),
  }});
client
  .del(key)
  .then((n) => {{
    console.log("Sessão removida:", key, "resultado=", n);
    return client.quit();
  }})
  .catch((err) => {{
    console.error(err);
    process.exit(1);
  }});
NODE
fi
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    if not pw:
        print("Sem credencial VPS")
        return 1
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=30)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
