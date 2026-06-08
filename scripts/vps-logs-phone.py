#!/usr/bin/env python3
"""Logs VPS para mensagem 7000 sem resposta."""
import os, paramiko, sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
pw = open(os.path.join(os.path.dirname(__file__), ".vps-deploy-secret"), encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, _ = c.exec_command(
    "journalctl -u mvp-backend --since '2026-06-05 20:45:00' --until '2026-06-05 20:48:00' --no-pager | grep -iE '5511992007226|7000|validation|error|inbound|renda' | tail -n 40",
    timeout=60,
)
print(o.read().decode("utf-8", errors="replace"))
c.close()
