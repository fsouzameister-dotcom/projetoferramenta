#!/usr/bin/env python3
"""Deploy ClientOn na VPS via SSH (Paramiko). Requer VPS_ROOT_PASSWORD no ambiente."""
from __future__ import annotations

import os
import sys
import time

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

HOST = os.environ.get("VPS_HOST", "173.214.173.110")
USER = os.environ.get("VPS_USER", "root")
def _load_password() -> str:
    env = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if env:
        return env
    secret_path = os.path.join(os.path.dirname(__file__), ".vps-deploy-secret")
    if os.path.isfile(secret_path):
        with open(secret_path, encoding="utf-8") as f:
            return f.read().strip()
    return ""


PASSWORD = _load_password()
REPO = os.environ.get(
    "REPO_URL", "https://github.com/fsouzameister-dotcom/projetoferramenta.git"
)
BRANCH = os.environ.get("GIT_BRANCH", "master")
BUILD_DIR = os.environ.get("BUILD_DIR", "/opt/build/projetoferramenta")
BACKEND_DST = os.environ.get("BACKEND_DST", "/opt/mvp-fluxo-backend")
FRONTEND_DST = os.environ.get("FRONTEND_DST", "/var/www/app")
VITE_API_URL = os.environ.get("VITE_API_URL", "https://api.clienton.com.br")
SYSTEMD_UNIT = os.environ.get("SYSTEMD_UNIT", "mvp-backend")

DEPLOY_SCRIPT = f"""set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "==> 1) Clone {BRANCH}"
mkdir -p "$(dirname "{BUILD_DIR}")"
rm -rf "{BUILD_DIR}"
git clone --branch "{BRANCH}" --depth 1 "{REPO}" "{BUILD_DIR}"

echo "==> 2) Backup .env"
if [[ -f "{BACKEND_DST}/.env" ]]; then
  cp "{BACKEND_DST}/.env" "/root/.env.mvp-fluxo-backend.bak.$(date +%Y%m%d_%H%M%S)"
fi

echo "==> 3) rsync backend"
rsync -av --delete \\
  --exclude='.env' \\
  --exclude='node_modules' \\
  --exclude='dist' \\
  "{BUILD_DIR}/mvp-fluxo-backend/" \\
  "{BACKEND_DST}/"

echo "==> 4) backend npm ci + build"
cd "{BACKEND_DST}"
npm ci
npm run build

echo "==> 5) migrations"
npm run migrate

echo "==> 6) restart {SYSTEMD_UNIT}"
systemctl restart "{SYSTEMD_UNIT}"
sleep 2
systemctl is-active "{SYSTEMD_UNIT}"

echo "==> 7) health local"
curl -sS -i "http://127.0.0.1:3000/health" | head -n 3

echo "==> 8) frontend build"
cd "{BUILD_DIR}/mvp-fluxo-frontend"
printf '%s\\n' 'VITE_API_URL={VITE_API_URL}' 'VITE_AGENT_DATA_MODE=api' > .env.production
npm ci
npm run build
rsync -av --delete dist/ "{FRONTEND_DST}/"

echo "==> 9) verificar rotas no dist compilado"
grep -o 'messages/audio' "{FRONTEND_DST}/assets/"*.js | head -n1 || echo "WARN: messages/audio nao encontrado no bundle"
grep -o 'messages/attachment' "{FRONTEND_DST}/assets/"*.js | head -n1 || echo "WARN: messages/attachment nao encontrado no bundle"

echo "==> DEPLOY_OK"
"""


def run_remote(cmd: str, timeout: int = 1800) -> int:
    if not PASSWORD:
        print("Defina VPS_ROOT_PASSWORD no ambiente.", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Conectando em {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30, banner_timeout=30)

    transport = client.get_transport()
    if transport:
        transport.set_keepalive(30)

    stdin, stdout, stderr = client.exec_command("bash -s", timeout=timeout)
    stdin.write(cmd)
    stdin.channel.shutdown_write()

    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            sys.stdout.write(stdout.read(4096).decode("utf-8", errors="ignore"))
            sys.stdout.flush()
        if stderr.channel.recv_stderr_ready():
            sys.stderr.write(stderr.read(4096).decode("utf-8", errors="ignore"))
            sys.stderr.flush()
        time.sleep(0.2)

    sys.stdout.write(stdout.read().decode("utf-8", errors="ignore"))
    sys.stderr.write(stderr.read().decode("utf-8", errors="ignore"))
    code = stdout.channel.recv_exit_status()
    client.close()
    return code


def main() -> int:
    code = run_remote(DEPLOY_SCRIPT, timeout=2400)
    if code != 0:
        print(f"Deploy falhou com codigo {code}", file=sys.stderr)
        return code

    print("Deploy concluido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
