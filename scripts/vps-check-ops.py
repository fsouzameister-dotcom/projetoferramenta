#!/usr/bin/env python3
import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pw = open("scripts/.vps-deploy-secret", encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
cmds = [
    "grep -c '/queues' /opt/mvp-fluxo-backend/dist/routes/protected.routes.js 2>/dev/null || echo 0",
    'curl -sS http://127.0.0.1:3000/api/queues 2>&1 | head -c 250',
    'curl -sS http://127.0.0.1:3000/api/service-settings 2>&1 | head -c 250',
]
for cmd in cmds:
    print("---", cmd[:60])
    _, o, e = c.exec_command(cmd)
    o.channel.recv_exit_status()
    print(o.read().decode("utf-8", errors="replace"))
    err = e.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
c.close()
