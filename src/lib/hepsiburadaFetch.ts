/**
 * Hepsiburada Partner API — kimlik doğrulamalı HTTP istek katmanı.
 *
 * Auth (2026-06-05 / 2026-08-02 developers.hepsiburada.com doğrulaması):
 *   - OMS / LISTING / FINANCE: HTTP Basic (username:password → base64)
 *     + zorunlu User-Agent "{merchantId} - {AppName}".
 *   - Katalog Ürün Entegrasyonu (MPOP `/product/api/*`): HTTP Basic Auth
 *     (05.06.2026 dokümantasyon — 5 ayrı yerde teyit). JWT Bearer
 *     (`catalog-bearer` / POST {MPOP}/api/authenticate) ARTIK bu servisler
 *     için güncel değil; kodda `@deprecated` olarak tutulur (rollback).
 *
 * Servis Anahtarı: Panelden alınan anahtarın Basic Auth'ta username mi
 * password mu olduğu DOĞRULANMADI. Opsiyonel `serviceKey` alanı +
 * `HB_USE_SERVICE_KEY_AS_PASSWORD=true` feature flag ile password yerine
 * kullanılabilir; varsayılan KAPALI.
 *
 * Base URL'ler:
 *   - OMS: oms-external.hepsiburada.com
 *   - OMS stub (yalnızca SIT): oms-stub-external-sit.hepsiburada.com
 *   - Claim stub (yalnızca SIT): claim-stub-external-sit.hepsiburada.com
 *   - MPOP / Listing / Diskonto / FINANCE (integration)
 *   - SHIPPING / MPFINANCE / ASKTOSELLER / SUPPLIER — SIT doğrulandı;
 *     prod domain'ler `-sit` kaldırılarak TAHMİNİ türetildi
 *
 * Katalog rate limit (Giriş Önemli Bilgiler): ~180 istek/dakika/IP.
 */

import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretCrypto";
import { fetchWithTimeoutAndRetry } from "@/lib/httpClient";
import { logger } from "@/lib/logger";

// ─── Sabit base URL'ler ──────────────────────────────────────────────────────

export const HB_BASE = {
  OMS: "https://oms-external.hepsiburada.com",
  OMS_SIT: "https://oms-external-sit.hepsiburada.com",
  /**
   * Yalnızca SIT — entegrasyon testi için sahte sipariş stub'ı.
   * Prod karşılığı yok; production ortamında çağrı engellenir.
   */
  OMS_STUB_SIT: "https://oms-stub-external-sit.hepsiburada.com",
  /**
   * Yalnızca SIT — test talebi (claim) oluşturma stub'ı.
   * Prod karşılığı yok; production ortamında çağrı engellenir.
   */
  CLAIM_STUB_SIT: "https://claim-stub-external-sit.hepsiburada.com",
  MPOP: "https://mpop.hepsiburada.com",
  MPOP_SIT: "https://mpop-sit.hepsiburada.com",
  LISTING: "https://listing-external.hepsiburada.com",
  LISTING_SIT: "https://listing-external-sit.hepsiburada.com",
  FINANCE: "https://integration.hepsiburada.com",
  /** Self-Campaign (Diskonto) — Kampanya / Promosyon */
  DISKONTO: "https://diskonto-external.hepsiburada.com",
  DISKONTO_SIT: "https://diskonto-external-sit.hepsiburada.com",
  /** Kargo profilleri / cargoFirms — SIT doğrulandı (03.08.2026) */
  SHIPPING_SIT: "https://shipping-external-sit.hepsiburada.com",
  // TAHMİNİ — prod'da ilk çağrıdan önce HB dokümantasyonundan teyit edilmeli
  SHIPPING: "https://shipping-external.hepsiburada.com",
  /** Muhasebe / performans — SIT doğrulandı (03.08.2026) */
  MPFINANCE_SIT: "https://mpfinance-external-sit.hepsiburada.com",
  // TAHMİNİ — prod'da ilk çağrıdan önce HB dokümantasyonundan teyit edilmeli
  MPFINANCE: "https://mpfinance-external.hepsiburada.com",
  /** Satıcıya Sor — SIT doğrulandı (03.08.2026) */
  ASKTOSELLER_SIT: "https://api-asktoseller-merchant-sit.hepsiburada.com",
  // TAHMİNİ — prod'da ilk çağrıdan önce HB dokümantasyonundan teyit edilmeli
  ASKTOSELLER: "https://api-asktoseller-merchant.hepsiburada.com",
  /** Tedarikçi — SIT doğrulandı (03.08.2026) */
  SUPPLIER_SIT: "https://supplier-api-external-sit.hepsiburada.com",
  // TAHMİNİ — prod'da ilk çağrıdan önce HB dokümantasyonundan teyit edilmeli
  SUPPLIER: "https://supplier-api-external.hepsiburada.com",
} as const;

export type HbBaseKey = keyof typeof HB_BASE;

// ─── Tip tanımları ───────────────────────────────────────────────────────────

export type HbEnvironment = "test" | "production";

export type HbCredentials = {
  merchantId: string;
  username: string;
  password: string;
  environment: HbEnvironment;
  /**
   * Panel "Servis Anahtarı". Basic Auth'taki rolü doğrulanmadı —
   * yalnızca `HB_USE_SERVICE_KEY_AS_PASSWORD=true` iken password yerine kullanılır.
   */
  serviceKey?: string;
};

export type HbFetchResult<T = unknown> =
  | { ok: true; data: T; status: number; headers?: Headers }
  | { ok: false; status: number; message: string };

export type HbFetchOptions = {
  extraHeaders?: Record<string, string>;
  requestId?: string;
  timeoutMs?: number;
  /** Yanıt Headers nesnesini de döndür (örn. X-Total-Count adayı). */
  includeHeaders?: boolean;
  /**
   * "basic" (varsayılan): OMS/Listing/Finance + Katalog `/product/api/*`.
   * "catalog-bearer": @deprecated — eski JWT yolu; katalog için kullanma.
   */
  authMode?: "basic" | "catalog-bearer";
};

// ─── Katalog JWT token cache (@deprecated) ───────────────────────────────────

type HbCatalogTokenCacheEntry = { token: string; fetchedAtMs: number };
const hbCatalogTokenCache = new Map<string, HbCatalogTokenCacheEntry>();
const HB_CATALOG_TOKEN_TTL_MS = 25 * 60_000;

function catalogTokenCacheKey(storeId: string, environment: HbEnvironment): string {
  return `${storeId}:${environment}`;
}

/**
 * @deprecated Katalog Ürün Entegrasyonu artık HTTP Basic kullanır (05.06.2026 dok.).
 * Rollback için tutuluyor; yeni çağıran eklemeyin.
 */
async function getHbCatalogBearerToken(credentials: HbCredentials): Promise<
  { ok: true; token: string } | { ok: false; message: string }
> {
  const cacheKey = catalogTokenCacheKey(credentials.merchantId, credentials.environment);
  const cached = hbCatalogTokenCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAtMs < HB_CATALOG_TOKEN_TTL_MS) {
    return { ok: true, token: cached.token };
  }

  const base = hbBaseUrl("MPOP", credentials.environment);
  const url = `${base}/api/authenticate`;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: credentials.username,
          password: credentials.password,
          authenticationType: "INTEGRATOR",
        }),
        cache: "no-store",
      },
      { requestName: "hbFetch:catalog-authenticate", timeoutMs: 15_000, maxRetries: 1 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası (katalog authenticate).";
    logger.error("hb_catalog_authenticate_failed", { message });
    return { ok: false, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  try {
    const data = JSON.parse(text) as { id_token?: string };
    if (!data.id_token) {
      return { ok: false, message: "Katalog authenticate yanıtında id_token yok." };
    }
    hbCatalogTokenCache.set(cacheKey, { token: data.id_token, fetchedAtMs: Date.now() });
    return { ok: true, token: data.id_token };
  } catch {
    return { ok: false, message: "Katalog authenticate: geçersiz JSON yanıtı." };
  }
}

// ─── Yardımcı: ortama göre base URL seç ─────────────────────────────────────

/** Prod domain'i SIT'ten `-sit` kaldırılarak TAHMİNİ türetilen anahtarlar. */
const HB_UNVERIFIED_PROD_BASE_KEYS = new Set<HbBaseKey>([
  "SHIPPING",
  "MPFINANCE",
  "ASKTOSELLER",
  "SUPPLIER",
]);

export function hbBaseUrl(key: HbBaseKey, environment: HbEnvironment): string {
  // Stub yalnızca SIT; production'da çağrı açık hata verir.
  if (key === "OMS_STUB_SIT") {
    if (environment !== "test") {
      throw new Error(
        "Test siparişi oluşturma yalnızca SIT ortamında kullanılabilir."
      );
    }
    return HB_BASE.OMS_STUB_SIT;
  }
  if (key === "CLAIM_STUB_SIT") {
    if (environment !== "test") {
      throw new Error(
        "Test talep (claim) oluşturma yalnızca SIT ortamında kullanılabilir."
      );
    }
    return HB_BASE.CLAIM_STUB_SIT;
  }

  if (environment === "test") {
    const sitMap: Partial<Record<HbBaseKey, string>> = {
      OMS: HB_BASE.OMS_SIT,
      MPOP: HB_BASE.MPOP_SIT,
      LISTING: HB_BASE.LISTING_SIT,
      DISKONTO: HB_BASE.DISKONTO_SIT,
      SHIPPING: HB_BASE.SHIPPING_SIT,
      MPFINANCE: HB_BASE.MPFINANCE_SIT,
      ASKTOSELLER: HB_BASE.ASKTOSELLER_SIT,
      SUPPLIER: HB_BASE.SUPPLIER_SIT,
    };
    return sitMap[key] ?? HB_BASE[key];
  }

  if (HB_UNVERIFIED_PROD_BASE_KEYS.has(key)) {
    logger.warn("hb_unverified_prod_domain", {
      baseKey: key,
      url: HB_BASE[key],
      note: "Prod domain SIT'ten TAHMİNİ türetildi — HB dokümantasyonundan teyit edilmeli.",
    });
  }

  return HB_BASE[key];
}

// ─── Credential yükleme ──────────────────────────────────────────────────────

async function getHbCredentials(storeId: string): Promise<HbCredentials> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "hepsiburada", isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!conn) {
    throw new Error(
      "Aktif Hepsiburada bağlantısı bulunamadı. Entegrasyon ayarlarından bağlayın."
    );
  }

  let username: string;
  let password: string;
  try {
    username = decryptSecret(conn.apiKeyEncrypted);
    password = decryptSecret(conn.apiSecretEncrypted);
  } catch {
    throw new Error(
      "Hepsiburada kimlik bilgileri çözülemedi. ENCRYPTION_KEY doğru mu kontrol edin."
    );
  }

  const environment: HbEnvironment =
    conn.environment === "test" ? "test" : "production";

  // Store-bazlı servis anahtarı (DB) → yoksa env HB_SERVICE_KEY (geriye uyumluluk).
  // Basic Auth'taki rolü doğrulanmadı — HB_USE_SERVICE_KEY_AS_PASSWORD flag'i.
  let serviceKey: string | undefined;
  if (conn.serviceKeyEncrypted?.trim()) {
    try {
      serviceKey = decryptSecret(conn.serviceKeyEncrypted).trim() || undefined;
    } catch {
      serviceKey = undefined;
    }
  }
  if (!serviceKey) {
    serviceKey = process.env.HB_SERVICE_KEY?.trim() || undefined;
  }

  return {
    merchantId: conn.sellerId.trim(),
    username: username.trim(),
    password: password.trim(),
    environment,
    serviceKey,
  };
}

// ─── Ortak header builder ────────────────────────────────────────────────────

async function buildHbHeaders(
  credentials: HbCredentials,
  authMode: "basic" | "catalog-bearer",
  extra?: Record<string, string>,
  opts?: { omitContentType?: boolean }
): Promise<{ ok: true; headers: Record<string, string> } | { ok: false; message: string }> {
  const appName = process.env.HB_APP_NAME?.trim() || "Maprithm";
  const userAgent = `${credentials.merchantId} - ${appName}`;

  let authHeader: string;
  if (authMode === "catalog-bearer") {
    const tokenRes = await getHbCatalogBearerToken(credentials);
    if (!tokenRes.ok) return { ok: false, message: tokenRes.message };
    authHeader = `Bearer ${tokenRes.token}`;
  } else {
    const useServiceKeyAsPassword =
      process.env.HB_USE_SERVICE_KEY_AS_PASSWORD === "true" &&
      Boolean(credentials.serviceKey?.trim());
    const basicPassword = useServiceKeyAsPassword
      ? credentials.serviceKey!.trim()
      : credentials.password;
    const token = Buffer.from(
      `${credentials.username}:${basicPassword}`,
      "utf8"
    ).toString("base64");
    authHeader = `Basic ${token}`;
  }

  const headers: Record<string, string> = {
    Authorization: authHeader,
    "User-Agent": userAgent,
    Accept: "application/json",
    ...(extra ?? {}),
  };
  if (!opts?.omitContentType) {
    headers["Content-Type"] = "application/json";
  }

  return { ok: true, headers };
}

// ─── Ortak hata mesajı ayıklayıcı ────────────────────────────────────────────

function extractHbError(text: string, status: number, statusText: string): string {
  let detail = "";
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    detail =
      (typeof j.message === "string" && j.message) ||
      (typeof j.error === "string" && j.error) ||
      (typeof j.description === "string" && j.description) ||
      (typeof j.errorDescription === "string" && j.errorDescription) ||
      (typeof j.code === "number" || typeof j.code === "string"
        ? `kod=${j.code}`
        : "") ||
      "";
  } catch {
    detail = text.slice(0, 300);
  }
  return (
    [`HTTP ${status}`, statusText, detail].filter(Boolean).join(" — ") ||
    "Bilinmeyen hata"
  );
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function hbFetch<T = unknown>(
  storeId: string,
  baseKey: HbBaseKey,
  path: string,
  options?: HbFetchOptions
): Promise<HbFetchResult<T>> {
  let credentials: HbCredentials;
  try {
    credentials = await getHbCredentials(storeId);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Credential hatası.",
    };
  }

  const base = hbBaseUrl(baseKey, credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headerRes = await buildHbHeaders(
    credentials,
    options?.authMode ?? "basic",
    options?.extraHeaders
  );
  if (!headerRes.ok) return { ok: false, status: 0, message: headerRes.message };
  const headers = headerRes.headers;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      { method: "GET", headers, cache: "no-store" },
      {
        requestName: `hbFetch:get:${baseKey}`,
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs ?? 15_000,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası.";
    logger.error("hb_api_failed", { helper: "hbFetch", path, storeId });
    return { ok: false, status: 0, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  try {
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return {
      ok: true,
      data,
      status: res.status,
      ...(options?.includeHeaders ? { headers: res.headers } : {}),
    };
  } catch {
    return { ok: false, status: res.status, message: "Geçersiz JSON yanıtı." };
  }
}

// ─── POST (JSON) ──────────────────────────────────────────────────────────────

export async function hbPostJson<T = unknown>(
  storeId: string,
  baseKey: HbBaseKey,
  path: string,
  body: unknown,
  options?: HbFetchOptions
): Promise<HbFetchResult<T>> {
  let credentials: HbCredentials;
  try {
    credentials = await getHbCredentials(storeId);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Credential hatası.",
    };
  }

  const base = hbBaseUrl(baseKey, credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headerRes = await buildHbHeaders(
    credentials,
    options?.authMode ?? "basic",
    options?.extraHeaders
  );
  if (!headerRes.ok) return { ok: false, status: 0, message: headerRes.message };
  const headers = headerRes.headers;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" },
      {
        requestName: `hbFetch:post:${baseKey}`,
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs ?? 15_000,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası.";
    logger.error("hb_api_failed", { helper: "hbPostJson", path, storeId });
    return { ok: false, status: 0, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  try {
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data, status: res.status };
  } catch {
    if (text.trim()) return { ok: true, data: text as T, status: res.status };
    return { ok: false, status: res.status, message: "Geçersiz JSON yanıtı." };
  }
}

/**
 * multipart/form-data POST — Content-Type set edilmez (boundary otomatik).
 * Katalog ürün import (3.1) için.
 */
export async function hbPostFormData<T = unknown>(
  storeId: string,
  baseKey: HbBaseKey,
  path: string,
  formData: FormData,
  options?: HbFetchOptions
): Promise<HbFetchResult<T>> {
  let credentials: HbCredentials;
  try {
    credentials = await getHbCredentials(storeId);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Credential hatası.",
    };
  }

  const base = hbBaseUrl(baseKey, credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headerRes = await buildHbHeaders(
    credentials,
    options?.authMode ?? "basic",
    options?.extraHeaders,
    { omitContentType: true }
  );
  if (!headerRes.ok) return { ok: false, status: 0, message: headerRes.message };
  const headers = headerRes.headers;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      { method: "POST", headers, body: formData, cache: "no-store" },
      {
        requestName: `hbFetch:postForm:${baseKey}`,
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs ?? 60_000,
        maxRetries: 0,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası.";
    logger.error("hb_api_failed", { helper: "hbPostFormData", path, storeId });
    return { ok: false, status: 0, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  try {
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data, status: res.status };
  } catch {
    if (text.trim()) return { ok: true, data: text as T, status: res.status };
    return { ok: false, status: res.status, message: "Geçersiz JSON yanıtı." };
  }
}

// ─── PUT (JSON) ──────────────────────────────────────────────────────────────

export async function hbPutJson<T = unknown>(
  storeId: string,
  baseKey: HbBaseKey,
  path: string,
  body: unknown,
  options?: HbFetchOptions
): Promise<HbFetchResult<T>> {
  let credentials: HbCredentials;
  try {
    credentials = await getHbCredentials(storeId);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Credential hatası.",
    };
  }

  const base = hbBaseUrl(baseKey, credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headerRes = await buildHbHeaders(
    credentials,
    options?.authMode ?? "basic",
    options?.extraHeaders
  );
  if (!headerRes.ok) return { ok: false, status: 0, message: headerRes.message };
  const headers = headerRes.headers;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      { method: "PUT", headers, body: JSON.stringify(body), cache: "no-store" },
      {
        requestName: `hbFetch:put:${baseKey}`,
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs ?? 15_000,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası.";
    logger.error("hb_api_failed", { helper: "hbPutJson", path, storeId });
    return { ok: false, status: 0, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  try {
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, status: res.status, message: "Geçersiz JSON yanıtı." };
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function hbDelete<T = unknown>(
  storeId: string,
  baseKey: HbBaseKey,
  path: string,
  options?: HbFetchOptions & { body?: unknown }
): Promise<HbFetchResult<T>> {
  let credentials: HbCredentials;
  try {
    credentials = await getHbCredentials(storeId);
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "Credential hatası.",
    };
  }

  const base = hbBaseUrl(baseKey, credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headerRes = await buildHbHeaders(
    credentials,
    options?.authMode ?? "basic",
    options?.extraHeaders
  );
  if (!headerRes.ok) return { ok: false, status: 0, message: headerRes.message };
  const headers = headerRes.headers;
  const hasBody = options?.body !== undefined;

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      {
        method: "DELETE",
        headers,
        ...(hasBody ? { body: JSON.stringify(options!.body) } : {}),
        cache: "no-store",
      },
      {
        requestName: `hbFetch:delete:${baseKey}`,
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs ?? 15_000,
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ağ hatası.";
    logger.error("hb_api_failed", { helper: "hbDelete", path, storeId });
    return { ok: false, status: 0, message };
  }

  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: extractHbError(text, res.status, res.statusText),
    };
  }

  if (!text.trim()) return { ok: true, data: {} as T, status: res.status };
  try {
    return { ok: true, data: JSON.parse(text) as T, status: res.status };
  } catch {
    return { ok: true, data: text as T, status: res.status };
  }
}

// ─── Merchant ID yardımcısı ──────────────────────────────────────────────────

export async function getHbMerchantId(storeId: string): Promise<string> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "hepsiburada", isActive: true },
    select: { sellerId: true },
  });
  if (!conn?.sellerId?.trim()) {
    throw new Error("Hepsiburada merchantId bulunamadı.");
  }
  return conn.sellerId.trim();
}

/** Mağaza HB bağlantısının ortamı (test | production). */
export async function getHbEnvironment(storeId: string): Promise<HbEnvironment> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "hepsiburada", isActive: true },
    select: { environment: true },
  });
  if (!conn) {
    throw new Error(
      "Aktif Hepsiburada bağlantısı bulunamadı. Entegrasyon ayarlarından bağlayın."
    );
  }
  return conn.environment === "test" ? "test" : "production";
}
