#!/usr/bin/env python3
import os, paramiko
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
pw = open(SECRET, encoding="utf-8").read().strip()
REMOTE = r"""set -eo pipefail
set -a
source /opt/mvp-fluxo-backend/.env
set +a
export TEST_TWILIO_ACCOUNT_SID="${TEST_TWILIO_ACCOUNT_SID:-$TWILIO_ACCOUNT_SID}"
cd /opt/mvp-fluxo-backend
npx tsx scripts/test-fox-resume.ts
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=180)
print(o.read().decode("utf-8", errors="replace"))
err = e.read().decode("utf-8", errors="replace")
if err.strip():
    print("stderr:", err)
c.close()
