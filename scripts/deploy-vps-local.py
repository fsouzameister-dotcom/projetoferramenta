#!/usr/bin/env python3
"""Deploy na VPS a partir do working tree local (sem depender de git push)."""
from __future__ import annotations

import os
import sys
import tarfile
import tempfile
import time
from pathlib import Path

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ROOT = Path(__file__).resolve().parents[1]
HOST = os.environ.get("VPS_HOST", "173.214.173.110")
USER = os.environ.get("VPS_USER", "root")


def _load_password() -> str:
    env = os.environ.get("VPS_ROOT_PASSWORD", "").strip()
    if env:
        return env
    secret_path = Path(__file__).with_name(".vps-deploy-secret")
    if secret_path.is_file():
        return secret_path.read_text(encoding="utf-8").strip()
    return ""


PASSWORD = _load_password()
BUILD_DIR = os.environ.get("BUILD_DIR", "/opt/build/projetoferramenta")
BACKEND_DST = os.environ.get("BACKEND_DST", "/opt/mvp-fluxo-backend")
FRONTEND_DST = os.environ.get("FRONTEND_DST", "/var/www/app")
VITE_API_URL = os.environ.get("VITE_API_URL", "https://api.clienton.com.br")
SYSTEMD_UNIT = os.environ.get("SYSTEMD_UNIT", "mvp-backend")

SKIP_PARTS = {"node_modules", "dist", ".git", "__pycache__"}


def add_tree(tar: tarfile.TarFile, folder: Path, arc_prefix: str) -> None:
    for path in folder.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(folder)
        if any(part in SKIP_PARTS for part in rel.parts):
            continue
        if path.name == ".env":
            continue
        tar.add(path, arcname=f"{arc_prefix}/{rel.as_posix()}")


def build_remote_script(tar_name: str) -> str:
    return f"""set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
echo "==> 1) Extrair pacote local em {BUILD_DIR}"
mkdir -p "{BUILD_DIR}"
rm -rf "{BUILD_DIR}/mvp-fluxo-backend" "{BUILD_DIR}/mvp-fluxo-frontend"
tar -xzf "/tmp/{tar_name}" -C "{BUILD_DIR}"

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

echo "==> DEPLOY_OK"
rm -f "/tmp/{tar_name}"
"""


def run() -> int:
    if not PASSWORD:
        print("Defina VPS_ROOT_PASSWORD ou scripts/.vps-deploy-secret", file=sys.stderr)
        return 2

    tar_name = f"clienton-local-deploy-{int(time.time())}.tar.gz"
    tar_path = Path(tempfile.gettempdir()) / tar_name

    print("Empacotando código local...")
    with tarfile.open(tar_path, "w:gz") as tar:
        add_tree(tar, ROOT / "mvp-fluxo-backend", "mvp-fluxo-backend")
        add_tree(tar, ROOT / "mvp-fluxo-frontend", "mvp-fluxo-frontend")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Conectando em {USER}@{HOST}...")
    client.connect(HOST, username=USER, password=PASSWORD, timeout=30, banner_timeout=30)
    transport = client.get_transport()
    if transport:
        transport.set_keepalive(30)

    print("Enviando pacote...")
    sftp = client.open_sftp()
    sftp.put(str(tar_path), f"/tmp/{tar_name}")
    sftp.close()
    tar_path.unlink(missing_ok=True)

    stdin, stdout, stderr = client.exec_command("bash -s", timeout=2400)
    stdin.write(build_remote_script(tar_name))
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
    code = run()
    if code != 0:
        print(f"Deploy local falhou com codigo {code}", file=sys.stderr)
        return code
    print("Deploy local concluido.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
