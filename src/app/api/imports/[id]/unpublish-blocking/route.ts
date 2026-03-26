import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { archiveProductOnTrendyol } from "@/lib/trendyolArchiveState";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

type Body = {
  productIds?: string[];
};

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const selectedProductIds =
    Array.isArray(body?.productIds) && body?.productIds.length > 0
      ? body.productIds.filter((x) => typeof x === "string" && x.trim().length > 0)
      : null;

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    return NextResponse.json(
      { success: false, message: "Aktif Trendyol bağlantısı bulunamadı." },
      { status: 400 }
    );
  }

  const allBlockingProducts = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string;
      price: number;
      mappingId: string;
      barcode: string | null;
      salePrice: number | null;
      listPrice: number | null;
    }>
  >(Prisma.sql`
    SELECT
      p."id",
      p."name",
      p."price"::numeric::float8 AS "price",
      m."id" AS "mappingId",
      m."barcode",
      m."salePrice",
      m."listPrice"
    FROM "Product" p
    INNER JOIN "ProductMarketplaceMapping" m
      ON m."productId" = p."id"
     AND m."platform" = 'trendyol'
     AND m."publishStatus" = 'published'
    WHERE p."userId" = ${ctx.userId}::uuid
      AND p."storeId" = ${ctx.storeId}::uuid
      AND p."sourceImportJobId" = ${params.id}::uuid
      AND COALESCE(p."lifecycleStatus", '') <> 'deleted'
  `);

  const blockingProducts = selectedProductIds
    ? allBlockingProducts.filter((p) => selectedProductIds.includes(p.id))
    : allBlockingProducts;

  if (blockingProducts.length === 0) {
    return NextResponse.json({
      success: true,
      message: "Yayında engelleyici ürün bulunamadı.",
      total: 0,
      successCount: 0,
      failedCount: 0,
      results: []
    });
  }

  const results: Array<{ productId: string; ok: boolean; message?: string }> = [];
  const now = new Date();

  for (const product of blockingProducts) {
    const barcode = String(product.barcode ?? "").trim();
    if (!barcode) {
      results.push({
        productId: product.id,
        ok: false,
        message: "Barkod bulunamadı."
      });
      continue;
    }

    const api = await archiveProductOnTrendyol({
      userId: ctx.userId,
      storeId: ctx.storeId,
      sellerId,
      barcode,
      archived: true
    });

    if (!api.ok) {
      results.push({
        productId: product.id,
        ok: false,
        message: api.message
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.productMarketplaceMapping.update({
        where: { id: product.mappingId },
        data: {
          publishStatus: "archived",
          archivedAt: now,
          lastSyncAt: now,
          lastErrorMessage: null
        }
      });
      await tx.product.update({
        where: { id: product.id },
        data: {
          lifecycleStatus: "archived",
          archivedAt: now
        }
      });
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "PRODUCT_ARCHIVED",
      entityType: "product",
      entityId: product.id,
      message: `Import silme öncesi Trendyol arşive alındı: ${product.name}`
    });

    results.push({ productId: product.id, ok: true });
  }

  const successCount = results.filter((r) => r.ok).length;
  const failedCount = results.length - successCount;

  return NextResponse.json({
    success: failedCount === 0,
    message:
      failedCount === 0
        ? "Seçilen ürünler Trendyol'da arşive alındı."
        : "Bazı ürünler yayından kaldırılamadı.",
    total: results.length,
    successCount,
    failedCount,
    results
  });
}
