#!/usr/bin/env python3
import paramiko, os
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
REMOTE = r"""set -a && source /opt/mvp-fluxo-backend/.env && set +a
cd /opt/mvp-fluxo-backend && node -e "
const { resolveInboundRouteByFirstMessage, resolveInboundRoute, whatsAppTwilioSourceKey } = require('./dist/inbound-routes');
const { pool } = require('./dist/db');
const TENANT = '00000000-0000-4000-8000-000000000001';
(async () => {
  const ch = await pool.query(
    `SELECT twilio_account_sid, twilio_whatsapp_number FROM whatsapp_channel_accounts WHERE tenant_id = $1::uuid AND provider = 'twilio_whatsapp' AND is_active = true LIMIT 1`,
    [TENANT]
  );
  const row = ch.rows[0];
  if (!row?.twilio_account_sid || !row?.twilio_whatsapp_number) {
    throw new Error('Canal Twilio ativo não encontrado para o tenant');
  }
  const sk = whatsAppTwilioSourceKey(row.twilio_account_sid, String(row.twilio_whatsapp_number).replace(/^\\+/, ''));
  const msg = await resolveInboundRouteByFirstMessage({ tenantId: TENANT, sourceType: 'twilio_whatsapp', sourceKey: sk, messageText: 'cadastrar-se' });
  console.log('msgRoute', msg && msg.label, msg && msg.flow_id);
  const def = await resolveInboundRoute({ tenantId: TENANT, sourceType: 'twilio_whatsapp', sourceKey: sk });
  console.log('default', def && def.label);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
"
"""
pw = open(SECRET, encoding="utf-8").read().strip()
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect("173.214.173.110", username="root", password=pw, timeout=30)
_, o, e = c.exec_command(REMOTE, timeout=45)
print(o.read().decode())
err = e.read().decode()
if err.strip(): print('stderr', err)
c.close()
