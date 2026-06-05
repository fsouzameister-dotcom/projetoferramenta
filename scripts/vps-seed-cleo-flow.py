#!/usr/bin/env python3
"""Aplica o seed do Fluxo Cleo (apresentação + teste) na VPS."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
FLOW_ID = os.environ.get("SEED_FLOW_ID", "5e1d2c63-10a1-42ee-9516-66c68d6dc751")

REMOTE = f"""set -eo pipefail
cd /opt/mvp-fluxo-backend
export SEED_FLOW_ID="{FLOW_ID}"
npm run seed:cleo-flow
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    if not pw:
        print("Defina VPS_ROOT_PASSWORD ou scripts/.vps-deploy-secret")
        return 1
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    stdin, stdout, stderr = client.exec_command(REMOTE, timeout=180)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    print(out)
    if err.strip():
        print("stderr:", err)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
