import { prisma } from "@/lib/prisma";
import { syncGlobalTrendyolCarrierCompanies } from "@/lib/trendyolCarrier";
import { normalizeBrandData, normalizeCategoryData } from "@/lib/trendyolNormalize";
import { trendyolSystemFetch } from "@/lib/trendyolSystemFetch";
import { logger } from "@/lib/logger";
import {
  syncTrendyolCategoryAttributesForAllLeafCategoriesSystem
} from "@/lib/trendyolSyncCategoryAttributes";
import { anyStoreProductV2Enabled } from "@/lib/trendyolStoreProductV2";
import {
  ISO3166_ALPHA2_COUNTRIES
} from "@/lib/trendyolOriginCountrySeed";

type TrendyolBrandRaw = Record<string, unknown>;
type TrendyolBrandsResponse = { brands: TrendyolBrandRaw[] };

type TrendyolCategoryRaw = {
  id: number;
  name: string;
  parentId?: number;
  subCategories?: TrendyolCategoryRaw[];
};
type TrendyolCategoriesResponse = { categories?: TrendyolCategoryRaw[] };

type FlatCategoryRow = {
  rawNode: TrendyolCategoryRaw;
  parentCategoryId: number | null;
  isLeaf: boolean;
};

function flattenCategories(
  nodes: TrendyolCategoryRaw[] | undefined,
  parentId: number | null
): FlatCategoryRow[] {
  const result: FlatCategoryRow[] = [];
  if (!nodes || !Array.isArray(nodes)) return result;
  for (const node of nodes) {
    const id = Number(node?.id);
    const name = String(node?.name ?? "").trim();
    if (!id || !name) continue;
    const sub = node.subCategories;
    const isLeaf = !sub || sub.length === 0;
    result.push({ rawNode: node, parentCategoryId: parentId, isLeaf });
    if (!isLeaf) result.push(...flattenCategories(sub, id));
  }
  return result;
}

/** Prisma/Postgres bind-variable limiti (~32767) için güvenli upsert paket boyutu. */
const CHUNK_SIZE = 500;

/** Global referans satırlarının bağlandığı sistem mağazası (nil UUID). */
export const SYSTEM_REFERENCE_STORE_ID =
  "00000000-0000-0000-0000-000000000000";

/** MarketplaceBrand/Category/Attribute FK'si için sistem Store satırını garanti eder. */
export async function ensureSystemReferenceStore(): Promise<void> {
  await prisma.store.upsert({
    where: { id: SYSTEM_REFERENCE_STORE_ID },
    create: {
      id: SYSTEM_REFERENCE_STORE_ID,
      name: "System Reference Store",
      slug: "system-reference",
      status: "active",
      currency: "TRY",
      locale: "tr-TR"
    },
    update: {
      name: "System Reference Store",
      status: "active"
    }
  });
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    out.push(items.slice(i, i + chunkSize));
  }
  return out;
}

export async function syncGlobalTrendyolBrands(): Promise<{ count: number }> {
  let totalProcessed = 0;
  let page = 0;
  const pageSize = 2000;
  const now = new Date();
  const seen = new Set<number>();
  const SYSTEM_STORE_ID = SYSTEM_REFERENCE_STORE_ID;

  while (true) {
    const result = await trendyolSystemFetch<TrendyolBrandsResponse>(
      `/integration/product/brands?page=${page}&size=${pageSize}`
    );
    if (!result.ok) throw new Error(result.message || "Trendyol marka API hatası.");
    const brands = result.data?.brands ?? [];
    if (brands.length === 0) break;

    const normalizedPage: Array<{
      brandId: number;
      name: string;
      isActive: boolean;
      rawData: unknown;
    }> = [];
    for (const b of brands) {
      const normalized = normalizeBrandData(b);
      if (!normalized) continue;
      seen.add(normalized.brandId);
      normalizedPage.push({
        brandId: normalized.brandId,
        name: normalized.name,
        isActive: normalized.isActive ?? true,
        rawData: normalized.rawData
      });
    }

    for (let i = 0; i < normalizedPage.length; i += CHUNK_SIZE) {
      const chunk = normalizedPage.slice(i, i + CHUNK_SIZE);
      await prisma.$transaction(
        chunk.map((item) =>
          prisma.marketplaceBrand.upsert({
            where: {
              storeId_platform_externalId: {
                storeId: SYSTEM_STORE_ID,
                platform: "TRENDYOL",
                externalId: item.brandId.toString()
              }
            },
            create: {
              storeId: SYSTEM_STORE_ID,
              platform: "TRENDYOL",
              externalId: item.brandId.toString(),
              name: item.name,
              isActive: item.isActive,
              metadata: item.rawData as any,
              createdAt: now,
              updatedAt: now
            },
            update: {
              name: item.name,
              isActive: item.isActive,
              metadata: item.rawData as any,
              updatedAt: now
            }
          })
        )
      );
      totalProcessed += chunk.length;
    }

    if (brands.length < pageSize) break;
    page++;
  }

  if (seen.size > 0) {
    const activeBrandRows = await prisma.marketplaceBrand.findMany({
      where: { platform: "TRENDYOL", isActive: true },
      select: { externalId: true }
    });
    const staleBrandIds = activeBrandRows
      .map((x: { externalId: string }) => parseInt(x.externalId, 10))
      .filter((id: number) => Number.isFinite(id) && !seen.has(id));
    for (const ids of chunkArray(staleBrandIds, CHUNK_SIZE)) {
      await prisma.marketplaceBrand.updateMany({
        where: {
          platform: "TRENDYOL",
          externalId: { in: ids.map((id) => id.toString()) },
          isActive: true
        },
        data: { isActive: false, updatedAt: now }
      });
    }
  }

  return { count: totalProcessed };
}

export async function syncGlobalTrendyolCategories(): Promise<{ count: number }> {
  const now = new Date();
  const SYSTEM_STORE_ID = SYSTEM_REFERENCE_STORE_ID;
  const result = await trendyolSystemFetch<TrendyolCategoriesResponse>(
    "/integration/product/product-categories"
  );
  if (!result.ok) throw new Error(result.message || "Trendyol kategori API hatası.");

  const categories = result.data?.categories ?? [];
  const flat = flattenCategories(categories, null);
  const seen = new Set<number>();
  let totalProcessed = 0;

  const rows: Array<{
    categoryId: number;
    name: string;
    parentId: string | null;
    isActive: boolean;
    metadata: Record<string, unknown>;
  }> = [];

  for (const row of flat) {
    const normalized = normalizeCategoryData(row.rawNode);
    if (!normalized) continue;
    seen.add(normalized.categoryId);
    rows.push({
      categoryId: normalized.categoryId,
      name: normalized.name,
      parentId: row.parentCategoryId ? row.parentCategoryId.toString() : null,
      isActive: normalized.isActive ?? true,
      metadata: { ...(normalized.rawData as object), isLeaf: row.isLeaf }
    });
  }

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await prisma.$transaction(
      chunk.map((item) =>
        prisma.marketplaceCategory.upsert({
          where: {
            storeId_platform_externalId: {
              storeId: SYSTEM_STORE_ID,
              platform: "TRENDYOL",
              externalId: item.categoryId.toString()
            }
          },
          create: {
            storeId: SYSTEM_STORE_ID,
            platform: "TRENDYOL",
            externalId: item.categoryId.toString(),
            name: item.name,
            parentId: item.parentId,
            isActive: item.isActive,
            metadata: item.metadata as any,
            createdAt: now,
            updatedAt: now
          },
          update: {
            name: item.name,
            parentId: item.parentId,
            isActive: item.isActive,
            metadata: item.metadata as any,
            updatedAt: now
          }
        })
      )
    );
    totalProcessed += chunk.length;
  }

  if (seen.size > 0) {
    const activeCategoryRows = await prisma.marketplaceCategory.findMany({
      where: { platform: "TRENDYOL", isActive: true },
      select: { externalId: true }
    });
    const staleCategoryIds = activeCategoryRows
      .map((x: { externalId: string }) => parseInt(x.externalId, 10))
      .filter((id: number) => Number.isFinite(id) && !seen.has(id));
    for (const ids of chunkArray(staleCategoryIds, CHUNK_SIZE)) {
      await prisma.marketplaceCategory.updateMany({
        where: {
          platform: "TRENDYOL",
          externalId: { in: ids.map((id) => id.toString()) },
          isActive: true
        },
        data: { isActive: false, updatedAt: now }
      });
    }
  }

  return { count: totalProcessed };
}

/**
 * Menşei referans listesini ISO 3166-1 alpha-2 statik kaynaktan TrendyolOriginCountry tablosuna yazar.
 * Ana pazaryeri createProducts/updateProduct akışı için ecgw (İhracat Merkezi) lookup kullanılmaz.
 */
export async function syncTrendyolOriginCountries(): Promise<{ count: number }> {
  let totalProcessed = 0;
  for (const entry of ISO3166_ALPHA2_COUNTRIES) {
    await prisma.trendyolOriginCountry.upsert({
      where: { code: entry.code },
      create: { code: entry.code, name: entry.name },
      update: { name: entry.name }
    });
    totalProcessed++;
  }
  return { count: totalProcessed };
}

export async function runGlobalTrendyolReferenceSync(params?: {
  triggeredByUserId?: string | null;
}): Promise<{
  carriers: number;
  carrierSource: "api" | "static";
  brands: number;
  categories: number;
  originCountries: number;
  categoryAttributes: number;
  categoryAttributeValues: number;
  categoriesProcessed: number;
  categoriesFailed: number;
}> {
  const conn = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" }
  });
  if (!conn) {
    throw new Error(
      "SystemMarketplaceConnection bulunamadı (platform=trendyol)."
    );
  }

  const startedAt = new Date();
  await prisma.systemMarketplaceConnection.update({
    where: { platform: "trendyol" },
    data: {
      lastSyncAt: startedAt,
      lastSyncStatus: "running",
      lastSyncMessage: "Global referans senkronu başladı."
    }
  });
  await prisma.systemReferenceSyncLog.create({
    data: {
      action: "SYSTEM_REFERENCE_SYNC_STARTED",
      status: "running",
      message: "Global Trendyol referans veri senkronu başladı.",
      triggeredByUserId: params?.triggeredByUserId ?? null
    }
  });

  try {
    await ensureSystemReferenceStore();
    const carriers = await syncGlobalTrendyolCarrierCompanies();
    const brands = await syncGlobalTrendyolBrands();
    const categories = await syncGlobalTrendyolCategories();
    const origins = await syncTrendyolOriginCountries();
    const useProductV2Paths = await anyStoreProductV2Enabled();
    const attrs = await syncTrendyolCategoryAttributesForAllLeafCategoriesSystem({
      useProductV2Paths
    });
    if (!attrs.success) throw new Error(attrs.message);

    const message = `Kargo ref: ${carriers.count} (${carriers.source}), marka: ${brands.count}, kategori: ${categories.count}, menşei: ${origins.count}, özellik: ${attrs.data.attributeCount}, değer: ${attrs.data.valueCount}`;
    await prisma.systemMarketplaceConnection.update({
      where: { platform: "trendyol" },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncMessage: message
      }
    });
    await prisma.systemReferenceSyncLog.create({
      data: {
        action: "SYSTEM_REFERENCE_SYNC_COMPLETED",
        status: "success",
        message,
        summary: {
          carriers: carriers.count,
          carrierSource: carriers.source,
          brands: brands.count,
          categories: categories.count,
          originCountries: origins.count,
          categoryAttributes: attrs.data.attributeCount,
          categoryAttributeValues: attrs.data.valueCount,
          categoriesProcessed: attrs.data.categoriesProcessed,
          categoriesFailed: attrs.data.categoriesFailed
        },
        triggeredByUserId: params?.triggeredByUserId ?? null
      }
    });

    return {
      carriers: carriers.count,
      carrierSource: carriers.source,
      brands: brands.count,
      categories: categories.count,
      originCountries: origins.count,
      categoryAttributes: attrs.data.attributeCount,
      categoryAttributeValues: attrs.data.valueCount,
      categoriesProcessed: attrs.data.categoriesProcessed,
      categoriesFailed: attrs.data.categoriesFailed
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Bilinmeyen hata";
    logger.error("reference_sync_failed", {
      helper: "runGlobalTrendyolReferenceSync",
      error: msg
    });
    await prisma.systemMarketplaceConnection.update({
      where: { platform: "trendyol" },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
        lastSyncMessage: msg.slice(0, 1000)
      }
    });
    await prisma.systemReferenceSyncLog.create({
      data: {
        action: "SYSTEM_REFERENCE_SYNC_FAILED",
        status: "failed",
        message: msg.slice(0, 1000),
        triggeredByUserId: params?.triggeredByUserId ?? null
      }
    });
    throw error;
  }
}

export async function syncGlobalTrendyolReferenceData(params?: {
  triggeredByUserId?: string | null;
}) {
  return runGlobalTrendyolReferenceSync(params);
}
