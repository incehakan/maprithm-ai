import { randomUUID } from "crypto";

export type TrendyolEnvironment = "stage" | "production";

export type TrendyolConnectionTestInput = {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  userAgent: string;
  environment: TrendyolEnvironment;
  /** Trendyol zorunlu header: isteği atan sunucunun IPv4 adresi */
  clientIp: string;
  /** Trendyol zorunlu header: istemci / entegratör adı */
  agentName: string;
  /** PRODUCT_V2: filterApprovedProducts ile bağlantı testi */
  useProductV2Filter?: boolean;
};

export type TrendyolConnectionTestResult = {
  ok: boolean;
  status: number;
  message: string;
};

function getBaseUrl(environment: TrendyolEnvironment): string {
  return environment === "stage"
    ? "https://stageapigw.trendyol.com"
    : "https://apigw.trendyol.com";
}

/**
 * Trendyol Partner API ile hafif bir GET (ürün listesi ilk sayfa) dener.
 * Dokümantasyon: filterProducts — sellers/{sellerId}/products
 */
export async function testTrendyolPartnerConnection(
  input: TrendyolConnectionTestInput
): Promise<TrendyolConnectionTestResult> {
  const base = getBaseUrl(input.environment);
  const path = input.useProductV2Filter
    ? `/integration/product/sellers/${encodeURIComponent(
        input.sellerId.trim()
      )}/products/approved?page=0&size=1`
    : `/integration/product/sellers/${encodeURIComponent(
        input.sellerId.trim()
      )}/products?page=0&size=1`;
  const url = `${base}${path}`;

  const token = Buffer.from(
    `${input.apiKey.trim()}:${input.apiSecret.trim()}`,
    "utf8"
  ).toString("base64");

  const correlationId = randomUUID();
  const clientIp =
    input.clientIp.trim() && /^[\d.]+$/.test(input.clientIp.trim())
      ? input.clientIp.trim()
      : "127.0.0.1";

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Basic ${token}`,
        "User-Agent": input.userAgent.trim(),
        "x-clientip": clientIp,
        "x-correlationid": correlationId,
        "x-agentname": input.agentName.trim().slice(0, 120),
        Accept: "application/json"
      },
      cache: "no-store"
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Ağ hatası (timeout veya DNS).";
    return {
      ok: false,
      status: 0,
      message: msg
    };
  }

  const text = await res.text();
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

  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      message: "Trendyol API yanıt verdi; kimlik bilgileri kabul edildi."
    };
  }

  const parts = [
    `HTTP ${res.status}`,
    res.statusText,
    detail || undefined
  ].filter(Boolean);
  const message = parts.join(" — ") || "Bilinmeyen hata";

  return {
    ok: false,
    status: res.status,
    message
  };
}
