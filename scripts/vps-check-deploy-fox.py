#!/usr/bin/env python3
import paramiko, os
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
REMOTE = """grep -n messageRouteEarly /opt/mvp-fluxo-backend/dist/inbound-orchestrator.js | head
grep -n resolveInboundRouteByFirstMessage /opt/mvp-fluxo-backend/dist/inbound-routes.js | head
head -c 200 /opt/mvp-fluxo-backend/dist/inbound-orchestrator.js
"""
pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, _ = c.exec_command(REMOTE, timeout=30)
print(o.read().decode())
c.close()
