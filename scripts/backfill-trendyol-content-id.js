/**
 * Onaylı Trendyol mapping'ler için trendyolContentId backfill.
 * getProductBase (V2) çağrısı yapar — yalnızca --apply ile.
 *
 * Dry-run (varsayılan): aday satırları listeler, API çağrısı yok.
 *
 * Kullanım:
 *   node scripts/backfill-trendyol-content-id.js
 *   node scripts/backfill-trendyol-content-id.js --apply
 *   node scripts/backfill-trendyol-content-id.js --store-id=<uuid> --apply
 *   node scripts/backfill-trendyol-content-id.js --stage-only --apply
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { randomUUID } = require("crypto");

const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = "aes-256-gcm";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}

function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || !raw.trim()) {
    throw new Error("ENCRYPTION_KEY tanımlı değil (.env).");
  }
  const key = Buffer.from(raw.trim(), "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY 32 bayt base64 olmalı.");
  }
  return key;
}

function decryptSecret(payload) {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Geçersiz şifreli veri.");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

function parseArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseUrl(environment) {
  return environment === "stage"
    ? "https://stageapigw.trendyol.com"
    : "https://apigw.trendyol.com";
}

function parseContentIdFromProductBase(data) {
  if (data == null || typeof data !== "object") return null;
  const direct = Number(data.contentId);
  if (Number.isFinite(direct) && direct > 0) return Math.round(direct);
  const content = data.content;
  if (content && typeof content === "object") {
    const cid = Number(content.contentId);
    if (Number.isFinite(cid) && cid > 0) return Math.round(cid);
  }
  return null;
}

async function fetchProductBase(conn, barcode) {
  const apiKey = decryptSecret(conn.apiKeyEncrypted);
  const apiSecret = decryptSecret(conn.apiSecretEncrypted);
  const environment =
    conn.environment === "stage" || conn.environment === "production"
      ? conn.environment
      : "production";
  const sellerId = String(conn.sellerId).trim();
  const path = `/integration/product/sellers/${encodeURIComponent(
    sellerId
  )}/product/${encodeURIComponent(barcode.trim())}`;
  const url = `${getBaseUrl(environment)}${path}`;

  const clientIp =
    process.env.TRENDYOL_FALLBACK_CLIENT_IP?.trim() &&
    /^[\d.]+$/.test(process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim())
      ? process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim()
      : "127.0.0.1";
  const agentName =
    process.env.TRENDYOL_AGENT_NAME?.trim()?.slice(0, 120) || "Maprithm";

  const token = Buffer.from(`${apiKey}:${apiSecret}`, "utf8").toString("base64");
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${token}`,
      "User-Agent": conn.userAgent,
      "x-clientip": clientIp,
      "x-correlationid": randomUUID(),
      "x-agentname": agentName,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  const text = await res.text();
  let data = null;
  let message = "";
  try {
    data = JSON.parse(text);
    message =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.errorMessage === "string" && data.errorMessage) ||
      "";
  } catch {
    message = text.slice(0, 280);
  }

  return {
    ok: res.ok,
    status: res.status,
    data,
    message: message || res.statusText || "Bilinmeyen hata"
  };
}

async function main() {
  loadEnv();
  const apply = hasFlag("apply");
  const stageOnly = hasFlag("stage-only");
  const storeIdFilter = parseArg("store-id");
  const limitRaw = parseArg("limit");
  const limit =
    limitRaw != null && Number.isFinite(Number(limitRaw)) && Number(limitRaw) > 0
      ? Math.round(Number(limitRaw))
      : null;
  const delayMsRaw = parseArg("delay-ms");
  const delayMs =
    delayMsRaw != null && Number.isFinite(Number(delayMsRaw))
      ? Math.max(0, Math.round(Number(delayMsRaw)))
      : 250;

  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    const where = {
      platform: "trendyol",
      approvalState: "APPROVED",
      trendyolContentId: null,
      AND: [{ barcode: { not: null } }, { NOT: { barcode: "" } }],
      ...(storeIdFilter ? { storeId: storeIdFilter } : {})
    };

    const candidates = await prisma.productMarketplaceMapping.findMany({
      where,
      select: {
        id: true,
        storeId: true,
        userId: true,
        barcode: true,
        product: { select: { name: true } },
        store: { select: { name: true } }
      },
      orderBy: [{ storeId: "asc" }, { barcode: "asc" }],
      ...(limit != null ? { take: limit } : {})
    });

    console.log(
      `[backfill-trendyol-content-id] Aday mapping: ${candidates.length}` +
        (stageOnly ? " (yalnızca stage bağlantılı mağazalar işlenecek)" : "") +
        (limit != null ? ` (limit=${limit})` : "")
    );

    if (candidates.length === 0) {
      console.log("İşlenecek satır yok (APPROVED + barkod dolu + contentId boş).");
      return;
    }

    const connByStore = new Map();
    for (const row of candidates) {
      if (!connByStore.has(row.storeId)) {
        const conn = await prisma.marketplaceConnection.findFirst({
          where: {
            storeId: row.storeId,
            platform: "trendyol",
            isActive: true,
            ...(stageOnly ? { environment: "stage" } : {})
          }
        });
        connByStore.set(row.storeId, conn ?? null);
      }
    }

    const processable = [];
    const skippedNoConn = [];

    for (const row of candidates) {
      const conn = connByStore.get(row.storeId);
      if (!conn) {
        skippedNoConn.push(row);
        continue;
      }
      processable.push({ row, conn });
    }

    console.log(`  İşlenebilir (aktif bağlantı): ${processable.length}`);
    console.log(`  Atlanan (bağlantı yok/pasif${stageOnly ? "/stage değil" : ""}): ${skippedNoConn.length}`);

    for (const { row, conn } of processable.slice(0, 15)) {
      console.log(
        `  · ${row.barcode} | store=${row.store.name} (${row.storeId}) | env=${conn.environment} | ${row.product.name}`
      );
    }
    if (processable.length > 15) {
      console.log(`  … ve ${processable.length - 15} satır daha`);
    }

    if (skippedNoConn.length > 0) {
      console.log("Atlanan mağazalar (örnek):");
      const seen = new Set();
      for (const row of skippedNoConn) {
        if (seen.has(row.storeId)) continue;
        seen.add(row.storeId);
        console.log(`  · ${row.store.name} (${row.storeId})`);
      }
    }

    if (!apply) {
      console.log(
        "\nDry-run — API çağrısı yapılmadı. Uygulamak için:\n" +
          "  npm run backfill:content-id -- --apply\n" +
          "  npm run backfill:content-id -- --stage-only --apply"
      );
      return;
    }

    if (processable.length === 0) {
      console.log("Uygulanacak satır yok (bağlantı eksik).");
      return;
    }

    let updated = 0;
    let failed = 0;
    let noContentId = 0;

    for (let i = 0; i < processable.length; i++) {
      const { row, conn } = processable[i];
      const barcode = String(row.barcode).trim();

      try {
        const result = await fetchProductBase(conn, barcode);
        if (!result.ok) {
          failed++;
          console.warn(
            `FAIL ${barcode} HTTP ${result.status}: ${result.message.slice(0, 160)}`
          );
          continue;
        }

        const contentId = parseContentIdFromProductBase(result.data);
        if (contentId == null) {
          noContentId++;
          console.warn(`SKIP ${barcode}: yanıtta contentId yok`);
          continue;
        }

        await prisma.productMarketplaceMapping.updateMany({
          where: { id: row.id, storeId: row.storeId },
          data: { trendyolContentId: contentId }
        });
        updated++;
        console.log(`OK ${barcode} → contentId=${contentId}`);
      } catch (e) {
        failed++;
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`FAIL ${barcode}: ${msg}`);
      }

      if (delayMs > 0 && i < processable.length - 1) {
        await sleep(delayMs);
      }
    }

    console.log(
      `\nÖzet: güncellendi=${updated}, contentId yok=${noContentId}, hata=${failed}`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
