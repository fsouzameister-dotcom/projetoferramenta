#!/usr/bin/env python3
"""Atualiza fox-flow-nodes.ts na VPS e reexecuta seed:fox-flow."""
from __future__ import annotations

import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
BACKEND = "/opt/mvp-fluxo-backend"
LOCAL_NODES = os.path.join(
    os.path.dirname(__file__), "..", "mvp-fluxo-backend", "scripts", "data", "fox-flow-nodes.ts"
)
REMOTE_NODES = f"{BACKEND}/scripts/data/fox-flow-nodes.ts"

pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pw, timeout=30)

sftp = c.open_sftp()
sftp.put(os.path.normpath(LOCAL_NODES), REMOTE_NODES)
sftp.close()
print("Uploaded fox-flow-nodes.ts")

_, o, e = c.exec_command(f"cd {BACKEND} && npm run seed:fox-flow", timeout=180)
out = o.read().decode("utf-8", errors="replace")
err = e.read().decode("utf-8", errors="replace")
print(out)
if err.strip():
    print("stderr:", err)
c.close()
