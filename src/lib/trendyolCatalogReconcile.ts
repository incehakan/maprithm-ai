import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import {
  filterApprovedProductsOnTrendyol,
  filterUnapprovedProductsOnTrendyol
} from "@/lib/trendyolProductApiV2";

type TrendyolCatalogEntry = {
  barcode: string;
  contentId: number | null;
  approved: boolean;
  archived: boolean;
};

const PAGE_SIZE = 200;
const MAX_PAGES = 50; // güvenlik sınırı: en fazla 10.000 ürün taranır

function normalizeBarcode(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

function parseListResponse(raw: unknown): {
  items: TrendyolCatalogEntry[];
  totalPages: number | null;
} {
  const root = raw as Record<string, unknown> | null;
  const contentArr = Array.isArray(root?.content)
    ? (root!.content as unknown[])
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];

  const items: TrendyolCatalogEntry[] = contentArr
    .map((x) => {
      if (x == null || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const barcode = typeof o.barcode === "string" ? o.barcode.trim() : "";
      if (!barcode) return null;
      const contentId = Number(o.contentId);
      return {
        barcode,
        contentId: Number.isFinite(contentId) && contentId > 0 ? Math.round(contentId) : null,
        approved: o.approved === true,
        archived: o.archived === true
      };
    })
    .filter((x): x is TrendyolCatalogEntry => x != null);

  const totalPagesRaw = Number(root?.totalPages);
  return {
    items,
    totalPages: Number.isFinite(totalPagesRaw) ? totalPagesRaw : null
  };
}

async function fetchAllTrendyolCatalog(params: {
  userId: string;
  storeId: string;
  sellerId: string;
}): Promise<TrendyolCatalogEntry[]> {
  const all: TrendyolCatalogEntry[] = [];

  for (const kind of ["approved", "unapproved"] as const) {
    let page = 0;
    for (let i = 0; i < MAX_PAGES; i++) {
      const query = `page=${page}&size=${PAGE_SIZE}`;
      const res =
        kind === "approved"
          ? await filterApprovedProductsOnTrendyol({
              userId: params.userId,
              storeId: params.storeId,
              sellerId: params.sellerId,
              query
            })
          : await filterUnapprovedProductsOnTrendyol({
              userId: params.userId,
              storeId: params.storeId,
              sellerId: params.sellerId,
              query
            });

      if (!res.ok) break;
      const { items, totalPages } = parseListResponse(res.data);
      all.push(...items);

      if (items.length < PAGE_SIZE) break;
      page += 1;
      if (totalPages != null && page >= totalPages) break;
    }
  }

  return all;
}

export type ReconcileTrendyolCatalogResult = {
  totalOnTrendyol: number;
  matchedAndLinked: number;
  alreadyLinked: number;
  notFoundLocally: number;
  linkedProductIds: string[];
};

/**
 * Trendyol'daki mevcut (başka bir araçla yayınlanmış) ürünleri barkod üzerinden
 * yerel Product.barcode ile eşleştirir; eşleşen ama henüz mapping'i olmayan
 * ürünler için otomatik ProductMarketplaceMapping oluşturur (publishStatus/approvalState
 * Trendyol'daki gerçek duruma göre ayarlanır). Var olan bir ürünü asla silmez/değiştirmez,
 * sadece eksik mapping'i tamamlar.
 */
export async function reconcileTrendyolCatalogWithLocalProducts(params: {
  userId: string;
  storeId: string;
  membershipId?: string | null;
}): Promise<ReconcileTrendyolCatalogResult> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId: params.storeId, platform: "trendyol" },
    orderBy: { updatedAt: "desc" }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    throw new Error("Trendyol bağlantısı aktif değil veya satıcı kimliği eksik.");
  }

  const catalog = await fetchAllTrendyolCatalog({
    userId: params.userId,
    storeId: params.storeId,
    sellerId
  });

  const localProducts = await prisma.product.findMany({
    where: {
      userId: params.userId,
      storeId: params.storeId,
      barcode: { not: null },
      lifecycleStatus: { notIn: ["archived", "deleted"] }
    },
    include: {
      marketplaceMappings: { where: { platform: "trendyol" }, take: 1 }
    }
  });

  const productByBarcode = new Map<string, (typeof localProducts)[number]>();
  for (const p of localProducts) {
    const key = normalizeBarcode(p.barcode);
    if (key) productByBarcode.set(key, p);
  }

  let matchedAndLinked = 0;
  let alreadyLinked = 0;
  let notFoundLocally = 0;
  const linkedProductIds: string[] = [];

  for (const entry of catalog) {
    const product = productByBarcode.get(normalizeBarcode(entry.barcode));
    if (!product) {
      notFoundLocally += 1;
      continue;
    }
    if (product.marketplaceMappings.length > 0) {
      alreadyLinked += 1;
      continue;
    }

    const publishStatus = entry.archived ? "archived" : entry.approved ? "published" : "sent";

    await prisma.productMarketplaceMapping.create({
      data: {
        productId: product.id,
        userId: params.userId,
        storeId: params.storeId,
        platform: "trendyol",
        barcode: entry.barcode,
        stockCode: product.sku ?? null,
        trendyolContentId: entry.contentId,
        approvalState: entry.approved ? "APPROVED" : "UNAPPROVED",
        publishStatus,
        publishedAt: entry.approved ? new Date() : null,
        currencyType: "TRY",
        useProductPrice: true,
        useProductStock: true
      }
    });

    matchedAndLinked += 1;
    linkedProductIds.push(product.id);
  }

  await createActivityLog({
    userId: params.userId,
    storeId: params.storeId,
    membershipId: params.membershipId ?? undefined,
    action: "TRENDYOL_CATALOG_RECONCILED",
    entityType: "store",
    entityId: params.storeId,
    message: `Trendyol katalog eşleştirme: ${catalog.length} Trendyol ürünü tarandı, ${matchedAndLinked} yeni eşleşme oluşturuldu, ${alreadyLinked} zaten eşleşmişti, ${notFoundLocally} yerelde bulunamadı.`
  });

  return {
    totalOnTrendyol: catalog.length,
    matchedAndLinked,
    alreadyLinked,
    notFoundLocally,
    linkedProductIds
  };
}
