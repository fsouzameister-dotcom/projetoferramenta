#!/usr/bin/env python3
"""Hotfix: envia arquivo(s) alterados e reinicia backend na VPS."""
from __future__ import annotations

import os
import sys
import paramiko

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
LOCAL_FILES = [
    (
        os.path.join(os.path.dirname(__file__), "..", "mvp-fluxo-backend", "src", "flow-field-validators.ts"),
        "/opt/mvp-fluxo-backend/src/flow-field-validators.ts",
    ),
]

pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pw, timeout=30)

sftp = c.open_sftp()
for local, remote in LOCAL_FILES:
    sftp.put(os.path.normpath(local), remote)
    print(f"Uploaded {os.path.basename(local)}")
sftp.close()

_, o, e = c.exec_command(
    "cd /opt/mvp-fluxo-backend && npm run build && systemctl restart mvp-backend && sleep 2 && systemctl is-active mvp-backend",
    timeout=180,
)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("stderr:", err)
c.close()
