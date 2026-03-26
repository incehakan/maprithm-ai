import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { extractBatchRequestId } from "@/lib/trendyolCreateProductPayload";
import { archiveProductOnTrendyol } from "@/lib/trendyolArchiveState";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Body = {
  productId?: string;
  archived?: boolean;
};

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.publish");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const productId = String(body?.productId ?? "").trim();
  const archived = body?.archived === true;
  if (!productId) {
    return NextResponse.json({ error: "Geçersiz ürün kimliği." }, { status: 400 });
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, userId: ctx.userId, storeId: ctx.storeId }
  });
  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const mapping = await prisma.productMarketplaceMapping.findUnique({
    where: { productId_platform: { productId, platform: "trendyol" } }
  });
  if (!mapping) {
    return NextResponse.json(
      { error: "Trendyol mapping kaydı bulunamadı." },
      { status: 400 }
    );
  }
  if (mapping.storeId !== ctx.storeId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const barcode = String(mapping.barcode ?? "").trim();
  if (!barcode) {
    return NextResponse.json({ error: "Barkod bulunamadı" }, { status: 400 });
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    return NextResponse.json({ error: "Trendyol bağlantısı bulunamadı" }, { status: 400 });
  }

  await prisma.productMarketplaceMapping.update({
    where: { id: mapping.id },
    data: {
      publishStatus: "processing",
      lastErrorMessage: null,
      lastSyncAt: new Date()
    }
  });

  const apiResult = await archiveProductOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    sellerId,
    barcode,
    archived
  });

  if (!apiResult.ok) {
    await prisma.productMarketplaceMapping.update({
      where: { id: mapping.id },
      data: {
        publishStatus: "failed",
        lastErrorMessage: apiResult.message.slice(0, 2000),
        lastSyncAt: new Date()
      }
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: archived ? "PRODUCT_ARCHIVE_FAILED" : "PRODUCT_UNARCHIVE_FAILED",
      entityType: "PRODUCT",
      entityId: productId,
      message: archived
        ? "Trendyol arşivleme başarısız oldu"
        : "Trendyol arşivden çıkarma başarısız oldu"
    });
    return NextResponse.json(
      {
        error: archived
          ? "Arşivleme isteği gönderilemedi"
          : "Arşivden çıkarma isteği gönderilemedi"
      },
      { status: apiResult.status >= 400 ? apiResult.status : 502 }
    );
  }

  const batchRequestId = extractBatchRequestId(apiResult.data);
  const now = new Date();
  const successStatus = archived ? "archived" : "published";

  await prisma.$transaction(async (tx) => {
    await tx.productMarketplaceMapping.update({
      where: { id: mapping.id },
      data: {
        publishStatus: successStatus,
        batchRequestId: batchRequestId ?? mapping.batchRequestId ?? null,
        archivedAt: archived ? now : null,
        unpublishedAt: archived ? (mapping.unpublishedAt ?? null) : null,
        lastSyncAt: now,
        lastErrorMessage: null
      }
    });

    await tx.product.update({
      where: { id: productId },
      data: {
        lifecycleStatus: successStatus,
        archivedAt: archived ? now : null,
        unpublishedAt: archived ? (product.unpublishedAt ?? null) : null
      }
    });

    if (batchRequestId) {
      await tx.trendyolPublishJob.upsert({
        where: { storeId_batchRequestId: { storeId: ctx.storeId, batchRequestId } },
        create: {
          userId: ctx.userId,
          storeId: ctx.storeId,
          batchRequestId,
          platform: "trendyol",
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          successCount: 0,
          failedCount: 0,
          pendingCount: 1,
          batchRequestType: archived ? "ProductArchive" : "ProductUnarchive",
          lastSyncMessage: archived
            ? "Ürün arşivleme isteği Trendyol kuyruğuna alındı."
            : "Ürün arşivden çıkarma isteği Trendyol kuyruğuna alındı."
        },
        update: {
          batchStatus: "IN_PROGRESS",
          itemCount: 1,
          pendingCount: 1,
          batchRequestType: archived ? "ProductArchive" : "ProductUnarchive",
          lastSyncMessage: archived
            ? "Ürün arşivleme isteği Trendyol kuyruğuna alındı."
            : "Ürün arşivden çıkarma isteği Trendyol kuyruğuna alındı."
        }
      });
    }
  });

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: archived ? "PRODUCT_ARCHIVED" : "PRODUCT_UNARCHIVED",
    entityType: "PRODUCT",
    entityId: productId,
    message: archived
      ? "Ürün Trendyol'da arşivlendi."
      : "Ürün Trendyol'da arşivden çıkarıldı."
  });

  return NextResponse.json({
    success: true,
    archived,
    batchRequestId,
    publishStatus: batchRequestId ? "processing" : successStatus,
    message: archived ? "Ürün arşivleme isteği gönderildi." : "Ürün arşivden çıkarma isteği gönderildi."
  });
}
