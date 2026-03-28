import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { decryptSecret } from "./secretCrypto";

export type TrendyolEnvironment = "stage" | "production";

type TrendyolCredentials = {
  apiKey: string;
  apiSecret: string;
  userAgent: string;
  environment: TrendyolEnvironment;
};

export type TrendyolFetchResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

function getBaseUrl(environment: TrendyolEnvironment): string {
  return environment === "stage"
    ? "https://stageapigw.trendyol.com"
    : "https://apigw.trendyol.com";
}

async function getCredentialsForUser(params: {
  userId: string;
  storeId: string;
}): Promise<{
  credentials: TrendyolCredentials;
  clientIp: string;
  agentName: string;
}> {
  const anyPrisma = prisma as any;
  if (
    !anyPrisma.marketplaceConnection ||
    typeof anyPrisma.marketplaceConnection.findUnique !== "function"
  ) {
    throw new Error(
      "MarketplaceConnection modeli henüz mevcut değil. Migration çalıştırın."
    );
  }

  // Store-first: connection is uniquely identified by storeId+platform,
  // so don't depend on the acting userId for lookup.
  const conn = await anyPrisma.marketplaceConnection.findFirst({
    where: {
      storeId: params.storeId,
      platform: "trendyol"
    },
    orderBy: { createdAt: "desc" }
  });

  if (!conn) {
    throw new Error("Aktif Trendyol bağlantısı bulunamadı. Önce bağlantıyı kaydedin.");
  }

  if (!conn.isActive) {
    throw new Error("Trendyol bağlantısı pasif. Önce aktif hale getirin.");
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decryptSecret(conn.apiKeyEncrypted);
    apiSecret = decryptSecret(conn.apiSecretEncrypted);
  } catch {
    throw new Error(
      "Kimlik bilgileri çözülemedi. ENCRYPTION_KEY doğru mu kontrol edin."
    );
  }

  const clientIp =
    process.env.TRENDYOL_FALLBACK_CLIENT_IP?.trim() &&
    /^[\d.]+$/.test(process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim())
      ? process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim()
      : "127.0.0.1";

  const agentName =
    process.env.TRENDYOL_AGENT_NAME?.trim()?.slice(0, 120) || "Maprithm";

  return {
    credentials: {
      apiKey,
      apiSecret,
      userAgent: conn.userAgent,
      environment:
        conn.environment === "stage" || conn.environment === "production"
          ? conn.environment
          : "production"
    },
    clientIp,
    agentName
  };
}

/**
 * Trendyol Partner API'ye kimlik doğrulamalı GET isteği gönderir.
 * Kullanıcının kayıtlı Trendyol bağlantısından credential kullanır.
 */
export type TrendyolFetchOptions = {
  extraHeaders?: Record<string, string>;
};

export async function trendyolFetch<T = unknown>(
  userId: string,
  storeId: string,
  path: string,
  options?: TrendyolFetchOptions
): Promise<TrendyolFetchResult<T>> {
  const { credentials, clientIp, agentName } =
    await getCredentialsForUser({ userId, storeId });

  const base = getBaseUrl(credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const token = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
    "utf8"
  ).toString("base64");

  const correlationId = randomUUID();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${token}`,
        "User-Agent": credentials.userAgent,
        "x-clientip": clientIp,
        "x-correlationid": correlationId,
        "x-agentname": agentName,
        Accept: "application/json",
        ...(options?.extraHeaders ?? {})
      },
      cache: "no-store"
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Ağ hatası (timeout veya DNS).";
    return { ok: false, status: 0, message: msg };
  }

  const text = await res.text();

  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      detail =
        (typeof j.message === "string" && j.message) ||
        (typeof j.exception === "string" && j.exception) ||
        (typeof j.errorMessage === "string" && j.errorMessage) ||
        "";
    } catch {
      detail = text.slice(0, 280);
    }
    const message =
      [`HTTP ${res.status}`, res.statusText, detail].filter(Boolean).join(" — ") ||
      "Bilinmeyen hata";
    return { ok: false, status: res.status, message };
  }

  try {
    const data = text ? (JSON.parse(text) as T) : ({} as T);
    return { ok: true, data, status: res.status };
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "Geçersiz JSON yanıtı."
    };
  }
}

/**
 * Trendyol Partner API'ye kimlik doğrulamalı POST (JSON body) gönderir.
 */
export async function trendyolPostJson<TResponse = unknown>(
  userId: string,
  storeId: string,
  path: string,
  body: unknown,
  options?: TrendyolFetchOptions
): Promise<TrendyolFetchResult<TResponse>> {
  const { credentials, clientIp, agentName } =
    await getCredentialsForUser({ userId, storeId });

  const base = getBaseUrl(credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const token = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
    "utf8"
  ).toString("base64");

  const correlationId = randomUUID();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${token}`,
        "User-Agent": credentials.userAgent,
        "x-clientip": clientIp,
        "x-correlationid": correlationId,
        "x-agentname": agentName,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options?.extraHeaders ?? {})
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Ağ hatası (timeout veya DNS).";
    return { ok: false, status: 0, message: msg };
  }

  const text = await res.text();

  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      detail =
        (typeof j.message === "string" && j.message) ||
        (typeof j.exception === "string" && j.exception) ||
        (typeof j.errorMessage === "string" && j.errorMessage) ||
        "";
    } catch {
      detail = text.slice(0, 500);
    }
    const message =
      [`HTTP ${res.status}`, res.statusText, detail].filter(Boolean).join(" — ") ||
      "Bilinmeyen hata";
    return { ok: false, status: res.status, message };
  }

  try {
    const data = text ? (JSON.parse(text) as TResponse) : ({} as TResponse);
    return { ok: true, data, status: res.status };
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "Geçersiz JSON yanıtı."
    };
  }
}

/**
 * Trendyol Partner API'ye kimlik doğrulamalı PUT (JSON body) gönderir.
 */
export async function trendyolPutJson<TResponse = unknown>(
  userId: string,
  storeId: string,
  path: string,
  body: unknown,
  options?: TrendyolFetchOptions
): Promise<TrendyolFetchResult<TResponse>> {
  const { credentials, clientIp, agentName } =
    await getCredentialsForUser({ userId, storeId });

  const base = getBaseUrl(credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const token = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
    "utf8"
  ).toString("base64");

  const correlationId = randomUUID();

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Basic ${token}`,
        "User-Agent": credentials.userAgent,
        "x-clientip": clientIp,
        "x-correlationid": correlationId,
        "x-agentname": agentName,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options?.extraHeaders ?? {})
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Ağ hatası (timeout veya DNS).";
    return { ok: false, status: 0, message: msg };
  }

  const text = await res.text();

  if (!res.ok) {
    let detail = "";
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      detail =
        (typeof j.message === "string" && j.message) ||
        (typeof j.exception === "string" && j.exception) ||
        (typeof j.errorMessage === "string" && j.errorMessage) ||
        "";
    } catch {
      detail = text.slice(0, 500);
    }
    const message =
      [`HTTP ${res.status}`, res.statusText, detail].filter(Boolean).join(" — ") ||
      "Bilinmeyen hata";
    return { ok: false, status: res.status, message };
  }

  try {
    const data = text ? (JSON.parse(text) as TResponse) : ({} as TResponse);
    return { ok: true, data, status: res.status };
  } catch {
    return {
      ok: false,
      status: res.status,
      message: "Geçersiz JSON yanıtı."
    };
  }
}
