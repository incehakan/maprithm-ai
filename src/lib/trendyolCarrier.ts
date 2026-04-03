import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { trendyolSystemFetch } from "@/lib/trendyolSystemFetch";
import { getTrendyolStorefrontCode } from "@/lib/trendyolShipmentPackages";
import { resolveCargoProviderDisplay } from "@/lib/trendyolTracking";

export type NormalizedCarrierCompany = {
  providerCode: string;
  providerName: string;
  region: string | null;
  rawData?: Prisma.InputJsonValue | null;
};

/** Dokümantasyonda geçen TR marketplace provider kodları (API yoksa yedek). */
export const STATIC_TRENDYOL_TR_CARRIERS: NormalizedCarrierCompany[] = [
  { providerCode: "YKMP", providerName: "Yurtiçi Kargo (MP)", region: "TR", rawData: null },
  { providerCode: "ARASMP", providerName: "Aras Kargo (MP)", region: "TR", rawData: null },
  { providerCode: "SURATMP", providerName: "Sürat Kargo (MP)", region: "TR", rawData: null },
  { providerCode: "HOROZMP", providerName: "Horoz (MP)", region: "TR", rawData: null },
  { providerCode: "DHLECOMMP", providerName: "DHL eCommerce (MP)", region: "TR", rawData: null },
  { providerCode: "PTTMP", providerName: "PTT Kargo (MP)", region: "TR", rawData: null },
  { providerCode: "CEVAMP", providerName: "CEVA (MP)", region: "TR", rawData: null },
  { providerCode: "TEXMP", providerName: "Trendyol Express (MP)", region: "TR", rawData: null },
  { providerCode: "UPSMP", providerName: "UPS (MP)", region: "TR", rawData: null },
  { providerCode: "KOLAYGELSINMP", providerName: "Kolay Gelsin (MP)", region: "TR", rawData: null },
  { providerCode: "CEVATEDARIK", providerName: "CEVA Tedarik", region: "TR", rawData: null }
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Ham API öğesini normalize eder (code/id + name alan adları değişebilir).
 */
export function normalizeCarrierCompany(raw: unknown): NormalizedCarrierCompany | null {
  const r = asRecord(raw);
  if (!r) return null;
  const code =
    (typeof r.code === "string" && r.code.trim()) ||
    (typeof r.providerCode === "string" && r.providerCode.trim()) ||
    (typeof r.id === "string" && r.id.trim()) ||
    (typeof r.cargoProvider === "string" && r.cargoProvider.trim()) ||
    (r.id != null ? String(r.id).trim() : "");
  const name =
    (typeof r.name === "string" && r.name.trim()) ||
    (typeof r.providerName === "string" && r.providerName.trim()) ||
    (typeof r.title === "string" && r.title.trim()) ||
    code;
  if (!code) return null;
  return {
    providerCode: code,
    providerName: name || code,
    region: typeof r.region === "string" ? r.region : null,
    rawData: raw as Prisma.InputJsonValue
  };
}

function parseCarrierListPayload(data: unknown): NormalizedCarrierCompany[] {
  if (data == null) return [];
  if (Array.isArray(data)) {
    return data.map(normalizeCarrierCompany).filter(Boolean) as NormalizedCarrierCompany[];
  }
  const root = asRecord(data);
  if (!root) return [];
  const candidates = [
    root.cargoProviders,
    root.providers,
    root.content,
    root.data,
    root.cargoProviderList,
    root.items
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map(normalizeCarrierCompany).filter(Boolean) as NormalizedCarrierCompany[];
    }
    const inner = asRecord(c);
    if (inner && Array.isArray(inner.content)) {
      return inner.content
        .map(normalizeCarrierCompany)
        .filter(Boolean) as NormalizedCarrierCompany[];
    }
  }
  return [];
}

/**
 * Trendyol kargo sağlayıcı listesini dener (endpoint sürüme göre değişebilir).
 */
export async function fetchTrendyolCarrierCompanies(): Promise<{
  ok: true;
  items: NormalizedCarrierCompany[];
  source: "api" | "empty";
  message?: string;
}> {
  const sf = getTrendyolStorefrontCode();
  const paths = [
    "/integration/order/cargo-providers",
    "/integration/order/providers",
    "/integration/order/cargoCompanies"
  ];
  for (const path of paths) {
    const res = await trendyolSystemFetch<unknown>(path, {
      extraHeaders: { storeFrontCode: sf }
    });
    if (!res.ok) continue;
    const items = parseCarrierListPayload(res.data);
    if (items.length > 0) {
      return { ok: true, items, source: "api" };
    }
  }
  return { ok: true, items: [], source: "empty", message: "API listesi boş veya endpoint bulunamadı." };
}

/**
 * Mağaza Trendyol kimlikleriyle kargo sağlayıcı listesini dener.
 * Ürün sağlayıcı uç noktası 404 döndüğünde yedek olarak kullanılır.
 */
export async function fetchTrendyolCarrierCompaniesForStore(
  userId: string,
  storeId: string
): Promise<{
  ok: true;
  items: NormalizedCarrierCompany[];
  source: "api" | "empty";
  message?: string;
}> {
  const sf = getTrendyolStorefrontCode();
  const paths = [
    "/integration/order/cargo-providers",
    "/integration/order/providers",
    "/integration/order/cargoCompanies"
  ];
  for (const path of paths) {
    const res = await trendyolFetch<unknown>(userId, storeId, path, {
      extraHeaders: { storeFrontCode: sf }
    });
    if (!res.ok) continue;
    const items = parseCarrierListPayload(res.data);
    if (items.length > 0) {
      return { ok: true, items, source: "api" };
    }
  }
  return {
    ok: true,
    items: [],
    source: "empty",
    message: "Kargo endpoint yanıt vermedi veya liste boş."
  };
}

export function resolveCarrierDisplayName(
  providerCode: string | null | undefined,
  providerName: string | null | undefined
): string {
  return resolveCargoProviderDisplay(providerCode, providerName);
}

export async function getActiveCarrierMap(platform = "trendyol"): Promise<Map<string, string>> {
  const rows = await prisma.marketplaceCarrierReference.findMany({
    where: { platform, isActive: true },
    select: { providerCode: true, providerName: true }
  });
  const m = new Map<string, string>();
  for (const r of rows) {
    m.set(r.providerCode, r.providerName);
  }
  return m;
}

/** Global referans tabloya yazar; API başarısızsa statik TR listesini kullanır. */
export async function syncGlobalTrendyolCarrierCompanies(): Promise<{
  count: number;
  source: "api" | "static";
}> {
  const pull = await fetchTrendyolCarrierCompanies();
  const now = new Date();
  let list =
    pull.items.length > 0 ? pull.items : STATIC_TRENDYOL_TR_CARRIERS;
  const source = pull.items.length > 0 ? "api" : "static";

  for (const c of list) {
    await prisma.marketplaceCarrierReference.upsert({
      where: {
        platform_providerCode: {
          platform: "trendyol",
          providerCode: c.providerCode
        }
      },
      create: {
        platform: "trendyol",
        providerCode: c.providerCode,
        providerName: c.providerName,
        region: c.region,
        isActive: true,
        rawData: c.rawData != null ? c.rawData : Prisma.JsonNull,
        lastSyncedAt: now
      },
      update: {
        providerName: c.providerName,
        region: c.region,
        isActive: true,
        rawData: c.rawData != null ? c.rawData : Prisma.JsonNull,
        lastSyncedAt: now
      }
    });
  }

  return { count: list.length, source };
}
