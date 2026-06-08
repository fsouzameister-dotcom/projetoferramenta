#!/usr/bin/env python3
import os, paramiko
SECRET = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
HOST = "173.214.173.110"
REMOTE = r"""set -a
source /opt/mvp-fluxo-backend/.env
set +a
SECRET=$(grep -E '^INBOUND_WEBHOOK_SECRET=' /opt/mvp-fluxo-backend/.env 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
SKIP=$(grep -E '^INBOUND_WEBHOOK_SKIP_SECRET=' /opt/mvp-fluxo-backend/.env 2>/dev/null | cut -d= -f2- | tr -d '\r' || true)
echo "skip_secret=$SKIP secret_len=${#SECRET}"
HDR=()
if [ "$SKIP" != "true" ] && [ -n "$SECRET" ]; then
  HDR=(-H "x-inbound-secret: $SECRET")
fi
SOURCE_KEY=$(psql "$DATABASE_URL" -At -c "SELECT 'twilio:' || twilio_account_sid || ':' || regexp_replace(twilio_whatsapp_number, '^\\+', '') FROM whatsapp_channel_accounts WHERE tenant_id = '00000000-0000-4000-8000-000000000001' AND provider = 'twilio_whatsapp' AND is_active = true LIMIT 1")
if [ -z "$SOURCE_KEY" ]; then echo "Canal Twilio ativo não encontrado"; exit 1; fi
curl -sS "${HDR[@]}" -H 'Content-Type: application/json' -H 'x-tenant-id: 00000000-0000-4000-8000-000000000001' \
  -d "{\"sourceType\":\"twilio_whatsapp\",\"sourceKey\":\"$SOURCE_KEY\",\"message\":\"cadastrar-se\",\"phone\":\"${TEST_PHONE:-+5511992007226}\",\"name\":\"Teste Fox\"}" \
  http://127.0.0.1:3000/webhooks/inbound
echo ""
"""


def main():
    pw = open(SECRET, encoding="utf-8").read().strip()
    c = paramiko.SSHClient()
    c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    c.connect(HOST, username="root", password=pw, timeout=30)
    _, o, e = c.exec_command(REMOTE, timeout=120)
    print(o.read().decode())
    err = e.read().decode()
    if err.strip():
        print("stderr:", err)
    c.close()


if __name__ == "__main__":
    main()
