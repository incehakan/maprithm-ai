#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
PM2_NAME="${PM2_NAME:-maprithm-ticaret-ai}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"

echo "[deploy] app dir: ${APP_DIR}"
cd "${APP_DIR}"

echo "[deploy] fetching latest code"
git pull --ff-only

echo "[deploy] installing dependencies"
npm install

echo "[deploy] prisma generate"
npx prisma generate

echo "[deploy] prisma migrate deploy"
npx prisma migrate deploy

# İlk kurulum veya yeni Permission/Role anahtarları sonrası bir kez:
# RUN_SEED=1 ./scripts/deploy.sh
if [ "${RUN_SEED:-0}" = "1" ]; then
  echo "[deploy] prisma seed (RUN_SEED=1 — izin/rol upsert)"
  node prisma/seed.js
fi

echo "[deploy] build"
npm run build

echo "[deploy] pm2 restart ${PM2_NAME}"
pm2 restart "${PM2_NAME}" --update-env

echo "[deploy] health check ${HEALTH_URL}"
curl -fsS "${HEALTH_URL}" || (echo "[deploy] health check failed" && exit 1)

echo "[deploy] completed"

