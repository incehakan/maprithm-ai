import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretCrypto";
import { fetchWithTimeoutAndRetry } from "@/lib/httpClient";
import { logger } from "@/lib/logger";

type TrendyolEnvironment = "stage" | "production";

type TrendyolCredentials = {
  apiKey: string;
  apiSecret: string;
  userAgent: string;
  environment: TrendyolEnvironment;
};

export type TrendyolSystemFetchResult<T = unknown> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

function getBaseUrl(environment: TrendyolEnvironment): string {
  return environment === "stage"
    ? "https://stageapigw.trendyol.com"
    : "https://apigw.trendyol.com";
}

export async function getSystemTrendyolCredentials(): Promise<{
  connectionId: string;
  credentials: TrendyolCredentials;
  clientIp: string;
  agentName: string;
}> {
  const conn = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" }
  });

  if (!conn || !conn.isActive) {
    throw new Error(
      "Global Trendyol sistem bağlantısı yok/pasif. SystemMarketplaceConnection kaydı oluşturun."
    );
  }

  let apiKey: string;
  let apiSecret: string;
  try {
    apiKey = decryptSecret(conn.apiKeyEncrypted);
    apiSecret = decryptSecret(conn.apiSecretEncrypted);
  } catch {
    throw new Error(
      "Global Trendyol sistem kimlik bilgileri çözülemedi (ENCRYPTION_KEY)."
    );
  }

  const clientIp =
    process.env.TRENDYOL_FALLBACK_CLIENT_IP?.trim() &&
    /^[\d.]+$/.test(process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim())
      ? process.env.TRENDYOL_FALLBACK_CLIENT_IP.trim()
      : "127.0.0.1";
  const agentName =
    process.env.TRENDYOL_AGENT_NAME?.trim()?.slice(0, 120) || "Maprithm-System";

  return {
    connectionId: conn.id,
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

export type TrendyolSystemFetchOptions = {
  extraHeaders?: Record<string, string>;
  requestId?: string;
  timeoutMs?: number;
};

export async function trendyolSystemFetch<T = unknown>(
  path: string,
  options?: TrendyolSystemFetchOptions
): Promise<TrendyolSystemFetchResult<T>> {
  const { credentials, clientIp, agentName } = await getSystemTrendyolCredentials();
  const base = getBaseUrl(credentials.environment);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const token = Buffer.from(
    `${credentials.apiKey}:${credentials.apiSecret}`,
    "utf8"
  ).toString("base64");
  const correlationId = randomUUID();

  let res: Response;
  try {
    res = await fetchWithTimeoutAndRetry(
      url,
      {
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
      },
      {
        requestName: "trendyolSystemFetch:get",
        requestId: options?.requestId,
        timeoutMs: options?.timeoutMs
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ağ hatası";
    logger.error("trendyol_api_failed", {
      helper: "trendyolSystemFetch",
      requestId: options?.requestId ?? null,
      path
    });
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
    return {
      ok: false,
      status: res.status,
      message: [`HTTP ${res.status}`, res.statusText, detail].filter(Boolean).join(" — ")
    };
  }

  try {
    return { ok: true, data: text ? (JSON.parse(text) as T) : ({} as T), status: res.status };
  } catch {
    return { ok: false, status: res.status, message: "Geçersiz JSON yanıtı." };
  }
}

