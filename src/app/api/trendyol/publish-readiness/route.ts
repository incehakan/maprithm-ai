import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import {
  evaluateTrendyolPublishReadiness,
  type CategoryAttrDef,
  type SavedMappingAttr
} from "@/lib/trendyolMappingReadiness";

const AI_MAIN_ID_PREFIX = "MAPRITHM-";
const MAX_ROWS = 1000;

function getUserId(session: { user?: { id?: string } | null } | null) {
  return session?.user?.id ?? null;
}

export type PublishReadinessRow = {
  productId: string;
  productName: string;
  mappingId: string;
  publishStatus: string;
  trendyolBrandId: number | null;
  brandName: string | null;
  trendyolCategoryId: number | null;
  categoryName: string | null;
  missingCount: number;
  missing: string[];
  ready: boolean;
  aiApplied: boolean;
};

export async function GET(request: Request) {
  const session = await auth();
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filterRaw = searchParams.get("filter")?.toLowerCase();
  const filter =
    filterRaw === "ready" || filterRaw === "missing" ? filterRaw : "all";
  const aiOnly = searchParams.get("aiOnly") === "1";

  const mappings = await prisma.productMarketplaceMapping.findMany({
    where: {
      userId,
      platform: "trendyol",
      ...(aiOnly ? { productMainId: { startsWith: AI_MAIN_ID_PREFIX } } : {})
    },
    include: {
      product: { select: { id: true, name: true, price: true, stock: true } },
      attributes: true
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS
  });

  const categoryIds = [
    ...new Set(
      mappings
        .map((m) => m.trendyolCategoryId)
        .filter((x): x is number => x != null && Number.isFinite(x))
    )
  ];

  const defsByCategory = new Map<number, CategoryAttrDef[]>();
  for (const cid of categoryIds) {
    const rows = await prisma.trendyolCategoryAttribute.findMany({
      where: { categoryId: cid },
      select: { attributeId: true, attributeName: true, isRequired: true },
      orderBy: { attributeName: "asc" }
    });
    defsByCategory.set(
      cid,
      rows.map((r) => ({
        attributeId: r.attributeId,
        attributeName: r.attributeName,
        isRequired: r.isRequired
      }))
    );
  }

  const brandIds = [
    ...new Set(
      mappings
        .map((m) => m.trendyolBrandId)
        .filter((x): x is number => x != null && Number.isFinite(x))
    )
  ];
  const brands =
    brandIds.length > 0
      ? await prisma.trendyolBrand.findMany({
          where: { brandId: { in: brandIds } },
          select: { brandId: true, name: true }
        })
      : [];
  const brandNameById = new Map(brands.map((b) => [b.brandId, b.name]));

  const categories =
    categoryIds.length > 0
      ? await prisma.trendyolCategory.findMany({
          where: { categoryId: { in: categoryIds } },
          select: { categoryId: true, name: true }
        })
      : [];
  const categoryNameById = new Map(
    categories.map((c) => [c.categoryId, c.name])
  );

  const rows: PublishReadinessRow[] = [];

  for (const m of mappings) {
    const cid = m.trendyolCategoryId;
    const categoryDefs =
      cid != null && Number.isFinite(cid)
        ? (defsByCategory.get(cid) ?? [])
        : [];

    const savedAttributes: SavedMappingAttr[] = m.attributes.map((a) => ({
      attributeId: a.attributeId,
      attributeValueId: a.attributeValueId,
      customValue: a.customValue
    }));

    const { ready, missing } = evaluateTrendyolPublishReadiness(
      {
        trendyolBrandId: m.trendyolBrandId,
        trendyolCategoryId: m.trendyolCategoryId,
        barcode: m.barcode,
        stockCode: m.stockCode,
        productMainId: m.productMainId,
        salePrice: m.salePrice,
        quantity: m.quantity,
        mainImageUrl: m.mainImageUrl,
        cargoCompanyId: m.cargoCompanyId,
        listPrice: m.listPrice
      },
      categoryDefs,
      savedAttributes,
      { price: Number(m.product.price), stock: m.product.stock }
    );

    const aiApplied = (m.productMainId?.trim() ?? "").startsWith(
      AI_MAIN_ID_PREFIX
    );

    const row: PublishReadinessRow = {
      productId: m.product.id,
      productName: m.product.name,
      mappingId: m.id,
      publishStatus: m.publishStatus,
      trendyolBrandId: m.trendyolBrandId,
      brandName:
        m.trendyolBrandId != null
          ? (brandNameById.get(m.trendyolBrandId) ?? null)
          : null,
      trendyolCategoryId: m.trendyolCategoryId,
      categoryName:
        m.trendyolCategoryId != null
          ? (categoryNameById.get(m.trendyolCategoryId) ?? null)
          : null,
      missingCount: missing.length,
      missing,
      ready,
      aiApplied
    };

    if (filter === "ready" && !ready) continue;
    if (filter === "missing" && ready) continue;
    rows.push(row);
  }

  return NextResponse.json({
    filter,
    aiOnly,
    total: rows.length,
    truncated: mappings.length >= MAX_ROWS,
    rows
  });
}
