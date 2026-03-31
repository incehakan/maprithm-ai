import { prisma } from "@/lib/prisma";
import {
  trendyolDelete,
  trendyolFetch,
  trendyolPostJson,
  trendyolPutJson
} from "@/lib/trendyolFetch";

export type TrendyolWebhookAuthType = "BASIC_AUTHENTICATION" | "API_KEY";

export type TrendyolWebhookUpsertBody = {
  url: string;
  authenticationType: TrendyolWebhookAuthType;
  username?: string;
  password?: string;
  apiKey?: string;
  subscribedStatuses?: string[] | null;
};

export const TRENDYOL_WEBHOOK_STATUSES = [
  "CREATED",
  "PICKING",
  "INVOICED",
  "SHIPPED",
  "CANCELLED",
  "DELIVERED",
  "UNDELIVERED",
  "RETURNED",
  "UNSUPPLIED",
  "AWAITING",
  "UNPACKED",
  "AT_COLLECTION_POINT",
  "VERIFIED"
] as const;

async function sellerIdForStore(storeId: string): Promise<string> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true }
  });
  const s = conn?.sellerId?.trim();
  if (!s) throw new Error("Trendyol bağlantısı veya sellerId yok.");
  return s;
}

export function validateWebhookUrl(urlStr: string): { ok: true; url: string } | { ok: false; error: string } {
  const u = urlStr.trim();
  if (!u) return { ok: false, error: "URL gerekli." };
  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return { ok: false, error: "Geçersiz URL." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Sadece http(s) URL kabul edilir." };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host.includes("trendyol") ||
    host.includes("dolap") ||
    host === "localhost" ||
    host.endsWith(".local")
  ) {
    return {
      ok: false,
      error:
        "Trendyol dokümantasyonu: URL içinde trendyol/dolap/localhost kullanmayın (hostname: " +
        host +
        ")."
    };
  }
  return { ok: true, url: u };
}

export function validateWebhookBody(
  body: TrendyolWebhookUpsertBody
): { ok: true } | { ok: false; error: string } {
  const urlCheck = validateWebhookUrl(body.url);
  if (!urlCheck.ok) return urlCheck;
  if (
    body.authenticationType !== "BASIC_AUTHENTICATION" &&
    body.authenticationType !== "API_KEY"
  ) {
    return { ok: false, error: "authenticationType BASIC_AUTHENTICATION veya API_KEY olmalı." };
  }
  if (body.authenticationType === "BASIC_AUTHENTICATION") {
    if (!body.username?.trim() || !body.password?.trim()) {
      return { ok: false, error: "Basic auth için username ve password gerekli." };
    }
  } else {
    if (!body.apiKey?.trim()) {
      return { ok: false, error: "API_KEY modunda apiKey gerekli." };
    }
  }
  return { ok: true };
}

export async function listTrendyolWebhooks(params: {
  userId: string;
  storeId: string;
  requestId?: string;
}) {
  const sellerId = await sellerIdForStore(params.storeId);
  const path = `/integration/webhook/sellers/${sellerId}/webhooks`;
  return trendyolFetch<unknown[]>(params.userId, params.storeId, path, {
    requestId: params.requestId
  });
}

export async function createTrendyolWebhook(params: {
  userId: string;
  storeId: string;
  body: TrendyolWebhookUpsertBody;
  requestId?: string;
}) {
  const sellerId = await sellerIdForStore(params.storeId);
  const path = `/integration/webhook/sellers/${sellerId}/webhooks`;
  const payload: Record<string, unknown> = {
    url: params.body.url.trim(),
    authenticationType: params.body.authenticationType
  };
  if (params.body.authenticationType === "BASIC_AUTHENTICATION") {
    payload.username = params.body.username?.trim();
    payload.password = params.body.password;
  } else {
    payload.apiKey = params.body.apiKey?.trim();
  }
  if (params.body.subscribedStatuses != null && params.body.subscribedStatuses.length > 0) {
    payload.subscribedStatuses = params.body.subscribedStatuses;
  }
  return trendyolPostJson<{ id?: string }>(
    params.userId,
    params.storeId,
    path,
    payload,
    { requestId: params.requestId }
  );
}

export async function updateTrendyolWebhook(params: {
  userId: string;
  storeId: string;
  webhookId: string;
  body: TrendyolWebhookUpsertBody;
  requestId?: string;
}) {
  const sellerId = await sellerIdForStore(params.storeId);
  const wid = params.webhookId.trim();
  const path = `/integration/webhook/sellers/${sellerId}/webhooks/${encodeURIComponent(wid)}`;
  const payload: Record<string, unknown> = {
    url: params.body.url.trim(),
    authenticationType: params.body.authenticationType
  };
  if (params.body.authenticationType === "BASIC_AUTHENTICATION") {
    payload.username = params.body.username?.trim();
    payload.password = params.body.password;
  } else {
    payload.apiKey = params.body.apiKey?.trim();
  }
  if (params.body.subscribedStatuses != null) {
    payload.subscribedStatuses = params.body.subscribedStatuses;
  }
  return trendyolPutJson<unknown>(
    params.userId,
    params.storeId,
    path,
    payload,
    { requestId: params.requestId }
  );
}

export async function deleteTrendyolWebhook(params: {
  userId: string;
  storeId: string;
  webhookId: string;
  requestId?: string;
}) {
  const sellerId = await sellerIdForStore(params.storeId);
  const wid = params.webhookId.trim();
  const path = `/integration/webhook/sellers/${sellerId}/webhooks/${encodeURIComponent(wid)}`;
  return trendyolDelete(params.userId, params.storeId, path, {
    requestId: params.requestId
  });
}
