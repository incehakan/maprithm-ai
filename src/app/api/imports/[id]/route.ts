import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

export async function GET(request: Request, { params }: Params) {
  try {
    let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
      return NextResponse.json({ success: false, message: msg }, { status: 401 });
    }

    const anyPrisma = prisma as any;
    const job = await anyPrisma.importJob.findFirst({
      where: {
        id: params.id,
        userId: ctx.userId,
        storeId: ctx.storeId,
        usageStatus: { not: "deleted" }
      },
      select: {
        id: true,
        sourceType: true,
        originalFileName: true,
        status: true,
        usageStatus: true,
        totalRows: true,
        successRows: true,
        failedRows: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!job) {
      return NextResponse.json(
        { success: false, message: "İçe aktarma bulunamadı." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get("limit");
    const offsetRaw = searchParams.get("offset");
    const statusFilter = searchParams.get("status")?.toLowerCase().trim();
    const limit = Math.min(
      500,
      Math.max(1, limitRaw ? parseInt(limitRaw, 10) || 100 : 100)
    );
    const offset = Math.max(0, offsetRaw ? parseInt(offsetRaw, 10) || 0 : 0);

    const rowWhere =
      statusFilter === "failed"
        ? { importJobId: params.id, status: "failed" as const }
        : { importJobId: params.id };

    const [rows, rowCount, failedOnlyCount] = await Promise.all([
      anyPrisma.importRow.findMany({
        where: rowWhere,
        orderBy: { rowIndex: "asc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          rowIndex: true,
          rawData: true,
          normalizedName: true,
          normalizedDescription: true,
          normalizedBrand: true,
          normalizedCategoryText: true,
          normalizedSku: true,
          normalizedBarcode: true,
          mainImageUrl: true,
          imageUrls: true,
          price: true,
          stock: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      anyPrisma.importRow.count({ where: rowWhere }),
      anyPrisma.importRow.count({
        where: { importJobId: params.id, status: "failed" }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: "Import detayı getirildi.",
      job,
      rows,
      counts: { failedRowsInDb: failedOnlyCount },
      pagination: { limit, offset, total: rowCount }
    });
  } catch (error) {
    console.error("[GET /api/imports/[id]] response error:", error);
    return NextResponse.json(
      { success: false, message: "Import detayı alınamadı." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
      return NextResponse.json({ success: false, message: msg }, { status: 401 });
    }

    const anyPrisma = prisma as any;
    const job = await anyPrisma.importJob.findFirst({
      where: {
        id: params.id,
        userId: ctx.userId,
        storeId: ctx.storeId,
        usageStatus: { not: "deleted" }
      },
      select: { id: true, originalFileName: true, usageStatus: true }
    });

    if (!job) {
      return NextResponse.json(
        { success: false, message: "İçe aktarma bulunamadı." },
        { status: 404 }
      );
    }

    const publishedLinkedProducts = await prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        sku: string | null;
        barcode: string | null;
        publishStatus: string | null;
      }>
    >(Prisma.sql`
      SELECT
        p."id",
        p."name",
        p."sku",
        m."barcode",
        m."publishStatus"
      FROM "Product" p
      INNER JOIN "ProductMarketplaceMapping" m
        ON m."productId" = p."id"
       AND m."platform" = 'trendyol'
       AND m."publishStatus" = 'published'
      WHERE p."userId" = ${ctx.userId}::uuid
        AND p."storeId" = ${ctx.storeId}::uuid
        AND p."sourceImportJobId" = ${params.id}::uuid
        AND COALESCE(p."lifecycleStatus", '') <> 'deleted'
      ORDER BY p."name" ASC
      LIMIT 100
    `);

    if (publishedLinkedProducts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Bu import silinemez. Trendyol'da yayında olan bağlı ürünleri önce yayından kaldırın.",
          blockingProducts: publishedLinkedProducts
        },
        { status: 409 }
      );
    }

    await anyPrisma.importJob.updateMany({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId },
      data: { usageStatus: "deleted" }
    });

    const now = new Date();
    const importedProducts = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT p."id"
      FROM "Product" p
      WHERE p."userId" = ${ctx.userId}::uuid
        AND p."storeId" = ${ctx.storeId}::uuid
        AND p."sourceImportJobId" = ${params.id}::uuid
        AND COALESCE(p."lifecycleStatus", '') <> 'deleted'
    `);
    const importedProductIds = importedProducts.map((p) => p.id);

    if (importedProductIds.length > 0) {
      await anyPrisma.product.updateMany({
        where: { id: { in: importedProductIds } },
        data: {
          lifecycleStatus: "deleted",
          archivedAt: now
        }
      });

      await anyPrisma.productMarketplaceMapping?.updateMany?.({
        where: {
          userId: ctx.userId,
          storeId: ctx.storeId,
          productId: { in: importedProductIds },
          platform: "trendyol"
        },
        data: {
          storeId: ctx.storeId,
          publishStatus: "archived",
          archivedAt: now,
          lastSyncAt: now
        }
      });
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "IMPORT_DELETED",
      entityType: "import_job",
      entityId: params.id,
      message: `Import silindi: ${job.originalFileName} (bağlı ürün: ${importedProductIds.length})`
    });

    return NextResponse.json({
      success: true,
      message: `${job.originalFileName} silindi.`,
      usageStatus: "deleted",
      affectedProductCount: importedProductIds.length
    });
  } catch (error) {
    console.error("[DELETE /api/imports/[id]] response error:", error);
    const detail =
      error instanceof Error ? error.message : "Bilinmeyen sunucu hatası";
    return NextResponse.json(
      { success: false, message: "Import silinemedi.", error: detail },
      { status: 500 }
    );
  }
}
