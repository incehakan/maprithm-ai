import { prisma } from "@/lib/prisma";
import { syncGlobalTrendyolCarrierCompanies } from "@/lib/trendyolCarrier";
import { normalizeBrandData, normalizeCategoryData } from "@/lib/trendyolNormalize";
import { trendyolSystemFetch } from "@/lib/trendyolSystemFetch";
import {
  syncTrendyolCategoryAttributesForAllLeafCategoriesSystem
} from "@/lib/trendyolSyncCategoryAttributes";

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

export async function syncGlobalTrendyolBrands(): Promise<{ count: number }> {
  let totalProcessed = 0;
  let page = 0;
  const pageSize = 2000;
  const now = new Date();
  const seen = new Set<number>();

  while (true) {
    const result = await trendyolSystemFetch<TrendyolBrandsResponse>(
      `/integration/product/brands?page=${page}&size=${pageSize}`
    );
    if (!result.ok) throw new Error(result.message || "Trendyol marka API hatası.");
    const brands = result.data?.brands ?? [];
    if (brands.length === 0) break;

    for (const b of brands) {
      const normalized = normalizeBrandData(b);
      if (!normalized) continue;
      seen.add(normalized.brandId);
      await prisma.trendyolBrand.upsert({
        where: { brandId: normalized.brandId },
        create: {
          brandId: normalized.brandId,
          name: normalized.name,
          isActive: normalized.isActive,
          removedAt: null,
          rawData: normalized.rawData,
          lastSyncedAt: now
        },
        update: {
          name: normalized.name,
          isActive: normalized.isActive,
          removedAt: null,
          rawData: normalized.rawData,
          lastSyncedAt: now
        }
      });
      totalProcessed++;
    }

    if (brands.length < pageSize) break;
    page++;
  }

  if (seen.size > 0) {
    await prisma.trendyolBrand.updateMany({
      where: { brandId: { notIn: [...seen] }, removedAt: null },
      data: { removedAt: now, isActive: false }
    });
  }

  return { count: totalProcessed };
}

export async function syncGlobalTrendyolCategories(): Promise<{ count: number }> {
  const now = new Date();
  const result = await trendyolSystemFetch<TrendyolCategoriesResponse>(
    "/integration/product/product-categories"
  );
  if (!result.ok) throw new Error(result.message || "Trendyol kategori API hatası.");

  const categories = result.data?.categories ?? [];
  const flat = flattenCategories(categories, null);
  const seen = new Set<number>();
  let totalProcessed = 0;

  for (const row of flat) {
    const normalized = normalizeCategoryData(row.rawNode);
    if (!normalized) continue;
    seen.add(normalized.categoryId);
    await prisma.trendyolCategory.upsert({
      where: { categoryId: normalized.categoryId },
      create: {
        categoryId: normalized.categoryId,
        name: normalized.name,
        parentCategoryId: row.parentCategoryId,
        isLeaf: row.isLeaf,
        isActive: normalized.isActive,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      },
      update: {
        name: normalized.name,
        parentCategoryId: row.parentCategoryId,
        isLeaf: row.isLeaf,
        isActive: normalized.isActive,
        removedAt: null,
        rawData: normalized.rawData,
        lastSyncedAt: now
      }
    });
    totalProcessed++;
  }

  if (seen.size > 0) {
    await prisma.trendyolCategory.updateMany({
      where: { categoryId: { notIn: [...seen] }, removedAt: null },
      data: { removedAt: now, isActive: false }
    });
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
    const carriers = await syncGlobalTrendyolCarrierCompanies();
    const brands = await syncGlobalTrendyolBrands();
    const categories = await syncGlobalTrendyolCategories();
    const attrs = await syncTrendyolCategoryAttributesForAllLeafCategoriesSystem();
    if (!attrs.success) throw new Error(attrs.message);

    const message = `Kargo ref: ${carriers.count} (${carriers.source}), marka: ${brands.count}, kategori: ${categories.count}, özellik: ${attrs.data.attributeCount}, değer: ${attrs.data.valueCount}`;
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
      categoryAttributes: attrs.data.attributeCount,
      categoryAttributeValues: attrs.data.valueCount,
      categoriesProcessed: attrs.data.categoriesProcessed,
      categoriesFailed: attrs.data.categoriesFailed
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Bilinmeyen hata";
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

