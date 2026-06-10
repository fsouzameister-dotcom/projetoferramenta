#!/usr/bin/env python3
"""Atualiza Fox (nodes + executor) na VPS, rebuild, restart e seed:fox-flow."""
from __future__ import annotations

import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
BACKEND = "/opt/mvp-fluxo-backend"
SYSTEMD_UNIT = "mvp-backend"
ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "mvp-fluxo-backend"))

UPLOADS = [
    ("scripts/data/fox-flow-nodes.ts", f"{BACKEND}/scripts/data/fox-flow-nodes.ts"),
    ("src/flow-executor.ts", f"{BACKEND}/src/flow-executor.ts"),
    ("src/flow-field-validators.ts", f"{BACKEND}/src/flow-field-validators.ts"),
]

pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pw, timeout=30)

sftp = c.open_sftp()
for local_rel, remote in UPLOADS:
    local_path = os.path.join(ROOT, local_rel.replace("/", os.sep))
    sftp.put(local_path, remote)
    print(f"Uploaded {local_rel}")
sftp.close()

for cmd, label in [
    (f"cd {BACKEND} && npm run build", "build"),
    (f"systemctl restart {SYSTEMD_UNIT} && sleep 2 && systemctl is-active {SYSTEMD_UNIT}", "restart"),
    (f"cd {BACKEND} && npm run seed:fox-flow", "seed"),
]:
    print(f"==> {label}")
    _, o, e = c.exec_command(cmd, timeout=300)
    out = o.read().decode("utf-8", errors="replace")
    err = e.read().decode("utf-8", errors="replace")
    if out.strip():
        print(out)
    if err.strip():
        print("stderr:", err)

c.close()
print("Fox flow atualizado na VPS.")
