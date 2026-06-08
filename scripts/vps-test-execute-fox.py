#!/usr/bin/env python3
import paramiko, os
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
REMOTE = r"""set -a && source /opt/mvp-fluxo-backend/.env && set +a
cd /opt/mvp-fluxo-backend && node -e "
const { executeFlow } = require('./dist/flow-executor');
const { pool } = require('./dist/db');
const TENANT = '00000000-0000-4000-8000-000000000001';
const FLOW = '37dc75e1-742f-4f22-8d34-93dfaa0a66c1';
(async () => {
  const t0 = Date.now();
  const r = await executeFlow(FLOW, TENANT, { userInput: 'cadastrar-se', phone: '+5511992007226', sessionId: 'diag' });
  console.log('ms', Date.now()-t0);
  console.log('status', r.status);
  console.log('msgs', r.messages?.length);
  console.log('preview', (r.messages?.[0]||'').slice(0,100));
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
"
"""
pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=90)
print(o.read().decode())
if e.read().decode().strip(): print('ERR', e.read().decode())
c.close()
