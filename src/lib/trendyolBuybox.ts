import { prisma } from "@/lib/prisma";
import { trendyolPostJson } from "@/lib/trendyolFetch";

const MAX_BARCODES_PER_REQUEST = 10;

export type TrendyolBuyboxInfo = {
  barcode: string;
  buyboxOrder: number | null;
  buyboxPrice: number | null;
  hasMultipleSeller: boolean;
  secondBuyboxPrice: number | null;
  thirdBuyboxPrice: number | null;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function parseBuyboxResponse(data: unknown): TrendyolBuyboxInfo[] {
  const root = data as Record<string, unknown> | null;
  const arr = Array.isArray(root?.buyboxInfo) ? root!.buyboxInfo : [];
  return arr
    .map((x) => {
      if (x == null || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const barcode = typeof o.barcode === "string" ? o.barcode : "";
      if (!barcode) return null;
      const num = (v: unknown): number | null =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return {
        barcode,
        buyboxOrder: num(o.buyboxOrder) != null ? Math.round(num(o.buyboxOrder)!) : null,
        buyboxPrice: num(o.buyboxPrice),
        hasMultipleSeller: o.hasMultipleSeller === true,
        secondBuyboxPrice: num(o.secondBuyboxPrice),
        thirdBuyboxPrice: num(o.thirdBuyboxPrice)
      };
    })
    .filter((x): x is TrendyolBuyboxInfo => x != null);
}

/**
 * Trendyol Buybox Kontrol Servisi — max 10 barkod/istek, 1000 req/dk limiti.
 * Verilen tüm barkodları otomatik 10'luk gruplara böler.
 */
export async function fetchTrendyolBuyboxInfo(params: {
  userId: string;
  storeId: string;
  barcodes: string[];
}): Promise<{ ok: true; results: TrendyolBuyboxInfo[] } | { ok: false; message: string }> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId: params.storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true }
  });
  const sellerId = conn?.sellerId?.trim();
  if (!sellerId) {
    return { ok: false, message: "Trendyol bağlantısı veya sellerId bulunamadı." };
  }

  const uniqueBarcodes = Array.from(
    new Set(params.barcodes.map((b) => b.trim()).filter(Boolean))
  );
  if (uniqueBarcodes.length === 0) {
    return { ok: true, results: [] };
  }

  const results: TrendyolBuyboxInfo[] = [];
  const batches = chunk(uniqueBarcodes, MAX_BARCODES_PER_REQUEST);

  for (const batch of batches) {
    const path = `/integration/product/sellers/${encodeURIComponent(sellerId)}/products/buybox-information`;
    const res = await trendyolPostJson<unknown>(
      params.userId,
      params.storeId,
      path,
      { barcodes: batch }
    );
    if (!res.ok) {
      return { ok: false, message: res.message };
    }
    results.push(...parseBuyboxResponse(res.data));
  }

  return { ok: true, results };
}
