#!/usr/bin/env bash
# Deploy na VPS — execute APÓS: ssh root@SEU_IP
# Ajuste as variáveis abaixo se seus paths/domínios forem diferentes.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/fsouzameister-dotcom/projetoferramenta.git}"
GIT_BRANCH="${GIT_BRANCH:-master}"
BUILD_DIR="${BUILD_DIR:-/opt/build/projetoferramenta}"
BACKEND_DST="${BACKEND_DST:-/opt/mvp-fluxo-backend}"
FRONTEND_DST="${FRONTEND_DST:-/var/www/app}"
VITE_API_URL="${VITE_API_URL:-https://api.clienton.com.br}"
# Painel do agente: "api" lê conversas reais da API (recomendado em produção).
VITE_AGENT_DATA_MODE="${VITE_AGENT_DATA_MODE:-api}"
APP_PUBLIC_URL="${APP_PUBLIC_URL:-https://app.clienton.com.br}"
SYSTEMD_UNIT="${SYSTEMD_UNIT:-mvp-backend}"

echo "==> 1) Clone atualizado em ${BUILD_DIR}"
mkdir -p "$(dirname "${BUILD_DIR}")"
rm -rf "${BUILD_DIR}"
git clone --branch "${GIT_BRANCH}" --depth 1 "${REPO_URL}" "${BUILD_DIR}"

echo "==> 2) Backup .env do backend"
if [[ -f "${BACKEND_DST}/.env" ]]; then
  cp "${BACKEND_DST}/.env" "/root/.env.mvp-fluxo-backend.bak.$(date +%Y%m%d_%H%M%S)"
fi

echo "==> 3) rsync backend (preserva .env, node_modules, dist)"
rsync -av --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  "${BUILD_DIR}/mvp-fluxo-backend/" \
  "${BACKEND_DST}/"

echo "==> 4) npm ci + build backend"
cd "${BACKEND_DST}"
npm ci
npm run build

echo "==> 5) Reiniciar ${SYSTEMD_UNIT}"
systemctl restart "${SYSTEMD_UNIT}"
systemctl status "${SYSTEMD_UNIT}" --no-pager || true

echo "==> 6) Health local"
curl -sS -i "http://127.0.0.1:3000/health" | head -n 5

echo "==> 7) Build frontend + publicar"
cd "${BUILD_DIR}/mvp-fluxo-frontend"
{
  echo "VITE_API_URL=${VITE_API_URL}"
  echo "VITE_AGENT_DATA_MODE=${VITE_AGENT_DATA_MODE:-api}"
} > .env.production
npm ci
npm run build
rsync -av --delete dist/ "${FRONTEND_DST}/"

echo "==> Pronto. Teste HTTPS:"
echo "    curl -i ${VITE_API_URL}/health"
echo "App (index deve referenciar assets/index-<hash>.js novo a cada build):"
echo "    curl -sS ${APP_PUBLIC_URL}/ | grep -o 'assets/index-[^\"]*\\.js' | head -n1"
echo "No browser: Admin → WhatsApp → linha 'bundle:' deve bater com o ficheiro em ${FRONTEND_DST}/assets/"
echo "Se alterou Apache, rode: apachectl configtest && systemctl reload apache2"
echo "Cache do index: ver scripts/apache-app-no-cache-html.conf no repositório."
echo "404 em /admin/... ao abrir URL direta: ver scripts/apache-app-spa-fallback.conf (mod_rewrite)."
