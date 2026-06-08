#!/usr/bin/env python3
import os, paramiko
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
REMOTE = """journalctl -u mvp-backend --since '2026-06-05 18:31:40' --until '2026-06-05 18:31:50' --no-pager 2>/dev/null"""
pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(HOST, username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=60)
print(o.read().decode())
c.close()
