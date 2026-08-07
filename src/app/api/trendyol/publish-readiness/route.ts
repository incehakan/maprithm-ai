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
    const rows = await prisma.marketplaceAttribute.findMany({
      where: { platform: "TRENDYOL", categoryId: cid.toString() },
      select: { categoryId: true, externalId: true, name: true, required: true },
      orderBy: { name: "asc" }
    });
    defsByCategory.set(
      cid,
      rows.map((r) => ({
        attributeId: parseInt(r.externalId, 10),
        attributeName: r.name,
        isRequired: r.required
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
      ? await prisma.marketplaceBrand.findMany({
          where: { platform: "TRENDYOL", externalId: { in: brandIds.map(id => id.toString()) } },
          select: { externalId: true, name: true }
        }).then(list => list.map(b => ({ brandId: parseInt(b.externalId, 10), name: b.name })))
      : [];
  const brandNameById = new Map(brands.map((b: any) => [b.brandId, b.name]));

  const categories =
    categoryIds.length > 0
      ? await prisma.marketplaceCategory.findMany({
          where: { platform: "TRENDYOL", externalId: { in: categoryIds.map(id => id.toString()) } },
          select: { externalId: true, name: true }
        }).then(list => list.map(c => ({ categoryId: parseInt(c.externalId, 10), name: c.name })))
      : [];
  const categoryNameById = new Map(
    categories.map((c: any) => [c.categoryId, c.name])
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
      brandName: (
        m.trendyolBrandId != null
          ? (brandNameById.get(m.trendyolBrandId) ?? null)
          : null
      ) as string | null,
      trendyolCategoryId: m.trendyolCategoryId,
      categoryName: (
        m.trendyolCategoryId != null
          ? (categoryNameById.get(m.trendyolCategoryId) ?? null)
          : null
      ) as string | null,
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
