import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { trendyolFetch } from "@/lib/trendyolFetch";
import {
  fetchTrendyolCarrierCompaniesForStore,
  type TrendyolCarrierFetchAttempt
} from "@/lib/trendyolCarrier";
import {
  rowsFromCarrierCompanies,
  rowsFromProductProvidersPayload,
  type CargoCompanyRow
} from "@/lib/trendyol/trendyolCargoNormalize";

function mergeRows(...lists: CargoCompanyRow[][]): CargoCompanyRow[] {
  const m = new Map<number, CargoCompanyRow>();
  for (const list of lists) {
    for (const r of list) {
      if (!m.has(r.cargoCompanyId)) m.set(r.cargoCompanyId, r);
    }
  }
  return Array.from(m.values()).sort((a, b) => a.cargoCompanyId - b.cargoCompanyId);
}

/**
 * Trendyol API’den kargo firmalarını çekip mağaza satırına yazar (idempotent upsert).
 * Hata durumunda mümkün olduğunca kısmi sonuç yazmaz; exception üst katmana iletilir.
 */
export async function syncTrendyolCargoCompanies(params: {
  userId: string;
  storeId: string;
}): Promise<{
  ok: boolean;
  upserted: number;
  attempts: TrendyolCarrierFetchAttempt[];
  primaryPath: string | null;
  primaryOk: boolean;
  primaryStatus: number;
  message?: string;
}> {
  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: params.storeId, platform: "trendyol" } }
  });

  if (!conn?.isActive) {
    return {
      ok: false,
      upserted: 0,
      attempts: [],
      primaryPath: null,
      primaryOk: false,
      primaryStatus: 0,
      message: "Aktif Trendyol bağlantısı yok."
    };
  }

  const sellerId = String(conn.sellerId).trim();
  if (!sellerId) {
    return {
      ok: false,
      upserted: 0,
      attempts: [],
      primaryPath: null,
      primaryOk: false,
      primaryStatus: 400,
      message: "Seller ID eksik."
    };
  }

  const productPath = `/integration/product/sellers/${encodeURIComponent(sellerId)}/providers`;
  const primary = await trendyolFetch<unknown>(params.userId, params.storeId, productPath);
  const primaryRows = primary.ok && primary.data != null
    ? rowsFromProductProvidersPayload(primary.data)
    : [];

  const carrierFb = await fetchTrendyolCarrierCompaniesForStore(
    params.userId,
    params.storeId,
    sellerId
  );
  const carrierRows = rowsFromCarrierCompanies(carrierFb.items);

  const merged = mergeRows(primaryRows, carrierRows);
  const now = new Date();

  if (merged.length === 0) {
    return {
      ok: true,
      upserted: 0,
      attempts: carrierFb.attempts,
      primaryPath: productPath,
      primaryOk: primary.ok,
      primaryStatus: primary.status,
      message: "API kargo listesi boş."
    };
  }

  for (const row of merged) {
    const raw =
      row.rawData === Prisma.JsonNull ? Prisma.JsonNull : row.rawData;
    await prisma.marketplaceCarrier.upsert({
      where: {
        storeId_platform_code: {
          storeId: params.storeId,
          platform: "TRENDYOL",
          code: row.cargoCompanyId.toString()
        }
      },
      create: {
        storeId: params.storeId,
        platform: "TRENDYOL",
        code: row.cargoCompanyId.toString(),
        name: row.name,
        metadata: raw,
        isActive: true,
        lastSyncedAt: now
      },
      update: {
        name: row.name,
        metadata: raw,
        isActive: true,
        lastSyncedAt: now
      }
    });
  }

  return {
    ok: true,
    upserted: merged.length,
    attempts: carrierFb.attempts,
    primaryPath: productPath,
    primaryOk: primary.ok,
    primaryStatus: primary.status
  };
}
