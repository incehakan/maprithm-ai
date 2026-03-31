#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
PM2_NAME="${PM2_NAME:-maprithm-ticaret-ai}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
HEALTH_URL="${HEALTH_URL:-${BASE_URL}/api/health}"
EXPECTED_BRANCH="${EXPECTED_BRANCH:-main}"

ok() { echo "[OK] $*"; }
warn() { echo "[WARN] $*" >&2; }
info() { echo "[INFO] $*"; }
fail() { echo "[FAIL] $*" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Command not found: $1"
}

http_code() {
  local url="$1"
  curl -sS -o /tmp/live_diag_body.$$ -w "%{http_code}" "$url" || echo "000"
}

print_section() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

require_cmd git
require_cmd curl
require_cmd node
require_cmd npm

cd "${APP_DIR}"

print_section "1) Git/Branch Durumu"
git fetch origin --quiet || warn "git fetch başarısız (ağ/izin kontrol edin)"

LOCAL_SHA="$(git rev-parse --short HEAD)"
REMOTE_SHA="$(git rev-parse --short "origin/${EXPECTED_BRANCH}" 2>/dev/null || true)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

info "Branch: ${CURRENT_BRANCH}"
info "Local HEAD: ${LOCAL_SHA}"
if [ -n "${REMOTE_SHA}" ]; then
  info "origin/${EXPECTED_BRANCH}: ${REMOTE_SHA}"
  if [ "${LOCAL_SHA}" = "${REMOTE_SHA}" ]; then
    ok "Local commit, origin/${EXPECTED_BRANCH} ile aynı."
  else
    warn "Local commit, origin/${EXPECTED_BRANCH} ile farklı. Canlı eski olabilir."
  fi
else
  warn "origin/${EXPECTED_BRANCH} SHA okunamadı."
fi

if [ -n "$(git status --porcelain)" ]; then
  warn "Working tree temiz değil. Sunucuda lokal değişiklikler var."
else
  ok "Working tree temiz."
fi

print_section "2) Prisma/Migration Durumu"
MIG_OUT="$(npx prisma migrate status 2>&1 || true)"
echo "${MIG_OUT}"
if echo "${MIG_OUT}" | grep -qi "database schema is up to date"; then
  ok "Migration durumu güncel."
else
  warn "Migration geride olabilir. 'npx prisma migrate deploy' önerilir."
fi

print_section "3) PM2/Süreç Durumu"
if command -v pm2 >/dev/null 2>&1; then
  pm2 describe "${PM2_NAME}" >/tmp/live_diag_pm2.$$ 2>&1 || true
  if grep -qi "status.*online" /tmp/live_diag_pm2.$$; then
    ok "PM2 process online: ${PM2_NAME}"
  else
    warn "PM2 process online görünmüyor: ${PM2_NAME}"
  fi
  echo "---- pm2 describe (özet) ----"
  grep -Ei "status|name|script path|exec cwd|node.js version|restarts|uptime" /tmp/live_diag_pm2.$$ || true
else
  warn "pm2 komutu bulunamadı. Process manager kontrol edilemedi."
fi

print_section "4) Health ve Kritik Route Testi"
HEALTH_CODE="$(http_code "${HEALTH_URL}")"
if [ "${HEALTH_CODE}" = "200" ]; then
  ok "Health endpoint 200: ${HEALTH_URL}"
else
  warn "Health endpoint başarısız: HTTP ${HEALTH_CODE} (${HEALTH_URL})"
fi
echo "---- /api/health body ----"
cat /tmp/live_diag_body.$$ || true
echo

declare -a PATHS=(
  "/"
  "/dashboard"
  "/returns"
  "/orders"
  "/trendyol/finance"
  "/api/health"
)

for p in "${PATHS[@]}"; do
  code="$(curl -sS -o /dev/null -w "%{http_code}" "${BASE_URL}${p}" || echo "000")"
  info "${BASE_URL}${p} -> HTTP ${code}"
done

print_section "5) Yetki/Oturum Notu (İadeler görünmüyorsa)"
cat <<'EOF'
- Menüde "İadeler" görünmesi için kullanıcıda `returns.view` olmalı.
- Yeni izinler eklendiyse bir kez seed çalıştırın:
    node prisma/seed.js
  veya deploy sırasında:
    RUN_SEED=1 ./scripts/deploy.sh
- Kullanıcı mutlaka çıkış yapıp tekrar giriş yapmalı (session permission cache).
EOF

print_section "Teşhis Tamamlandı"
ok "Rapor üretildi. Uyarı satırlarını takip ederek aksiyon alın."

