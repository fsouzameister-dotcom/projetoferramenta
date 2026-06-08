#!/usr/bin/env python3
"""Testa execucao do fluxo Fox na VPS."""
from __future__ import annotations

import os
import paramiko

SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = os.environ.get("VPS_HOST", "173.214.173.110")

REMOTE = r"""set -eo pipefail
cd /opt/mvp-fluxo-backend
npx tsx -e "
import { executeFlow } from './src/flow-executor.ts';
import { resolveInboundRouteByFirstMessage } from './src/inbound-routes.ts';
import { getOutboundWhatsAppContext } from './src/whatsapp-channels.ts';
import { pool } from './src/db.ts';

const TENANT = '00000000-0000-4000-8000-000000000001';
const FLOW = '37dc75e1-742f-4f22-8d34-93dfaa0a66c1';

const ch = await pool.query(
  `SELECT twilio_account_sid, twilio_whatsapp_number FROM whatsapp_channel_accounts WHERE tenant_id = $1::uuid AND provider = 'twilio_whatsapp' AND is_active = true LIMIT 1`,
  [TENANT]
);
const tw = ch.rows[0];
if (!tw?.twilio_account_sid || !tw?.twilio_whatsapp_number) throw new Error('Canal Twilio ativo não encontrado');
const { whatsAppTwilioSourceKey } = await import('./src/inbound-routes.ts');
const sourceKey = whatsAppTwilioSourceKey(tw.twilio_account_sid, String(tw.twilio_whatsapp_number).replace(/^\\+/, ''));

const route = await resolveInboundRouteByFirstMessage({
  tenantId: TENANT,
  sourceType: 'twilio_whatsapp',
  sourceKey,
  messageText: 'cadastrar-se',
});
console.log('route', route ? { id: route.id, flow_id: route.flow_id, label: route.label } : null);

const wa = await getOutboundWhatsAppContext(TENANT);
console.log('wa', wa ? { provider: wa.provider, from: wa.fromE164 ?? wa.phoneNumberId } : null);

const result = await executeFlow(FLOW, TENANT, {
  userInput: 'cadastrar-se',
  phone: '+5511992007226',
  sessionId: 'test:fox:manual',
});
console.log('status', result.status);
console.log('messages_count', result.messages?.length ?? 0);
console.log('first_msg', (result.messages?.[0] ?? '').slice(0, 120));
console.log('outbound_count', result.outboundMessages?.length ?? 0);
if (result.awaitingInput) console.log('awaiting', result.awaitingInput.nodeId);
await pool.end();
"
"""


def main() -> int:
    pw = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if not pw and os.path.isfile(SECRET):
        pw = open(SECRET, encoding="utf-8").read().strip()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username="root", password=pw, timeout=30)
    _, stdout, stderr = client.exec_command(REMOTE, timeout=120)
    print(stdout.read().decode("utf-8", errors="replace"))
    err = stderr.read().decode("utf-8", errors="replace")
    if err.strip():
        print("stderr:", err)
    client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
