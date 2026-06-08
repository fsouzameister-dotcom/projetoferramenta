#!/usr/bin/env python3
import os, paramiko
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
pw = open(SECRET, encoding="utf-8").read().strip()
REMOTE = r"""set -a
source /opt/mvp-fluxo-backend/.env
set +a
echo "REDIS_HOST=$REDIS_HOST REDIS_PORT=$REDIS_PORT REDIS_URL=${REDIS_URL:+set}"
cd /opt/mvp-fluxo-backend
node -e "
const Redis = require('ioredis');
const url = process.env.REDIS_URL;
const client = url ? new Redis(url) : new Redis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379) });
(async () => {
  try {
    const r = await client.set('mvp:diag:test', 'ok', 'EX', 30);
    console.log('set result', r);
    const v = await client.get('mvp:diag:test');
    console.log('get result', v);
    const keys = await client.keys('inbound:flow:session:*');
    console.log('session keys count', keys.length);
    if (keys.length) console.log('sample', keys.slice(0,3));
  } catch (e) { console.error('ERR', e.message); }
  finally { client.disconnect(); }
})();
"""
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=60)
print(o.read().decode())
err = e.read().decode()
if err.strip(): print("stderr", err)
c.close()
