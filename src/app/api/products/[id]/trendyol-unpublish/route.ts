import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { canUnpublishProduct } from "@/lib/productLifecycle";
import { archiveProductOnTrendyol } from "@/lib/trendyolArchiveState";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.unpublish");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const product = await prisma.product.findFirst({
    where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
  });
  if (!product) {
    return NextResponse.json({ error: "Ürün bulunamadı." }, { status: 404 });
  }

  const mapping = await prisma.productMarketplaceMapping.findUnique({
    where: {
      productId_platform: {
        productId: params.id,
        platform: "trendyol"
      }
    }
  });
  if (!mapping) {
    return NextResponse.json(
      { error: "Trendyol eşleştirmesi bulunamadı." },
      { status: 400 }
    );
  }
  if (mapping.storeId !== ctx.storeId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  if (!canUnpublishProduct(product as any, mapping as any)) {
    return NextResponse.json(
      { error: "Ürün yayında değil, yayından kaldırılamaz." },
      { status: 400 }
    );
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    return NextResponse.json(
      { error: "Aktif Trendyol bağlantısı bulunamadı." },
      { status: 400 }
    );
  }

  const barcode = String(mapping.barcode ?? "").trim();
  if (!barcode) {
    return NextResponse.json(
      { error: "Barkod bulunamadı; Trendyol arşivleme yapılamaz." },
      { status: 400 }
    );
  }

  const api = await archiveProductOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    sellerId,
    barcode,
    archived: true
  });

  if (!api.ok) {
    await prisma.productMarketplaceMapping.update({
      where: { id: mapping.id },
      data: {
        publishStatus: "failed",
        lastErrorMessage: api.message.slice(0, 2000),
        lastSyncAt: new Date()
      }
    });

    const friendly =
      api.status === 404
        ? "Trendyol ürün kaydı bulunamadı. Ürün daha önce başarılı yayınlanmadıysa önce yayına alınmalıdır."
        : api.message;

    return NextResponse.json(
      { error: `Trendyol arşivleme başarısız: ${friendly}` },
      { status: api.status >= 400 ? api.status : 502 }
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.productMarketplaceMapping.update({
      where: { id: mapping.id },
      data: {
        publishStatus: "archived",
        archivedAt: now,
        lastSyncAt: now,
        lastErrorMessage: null
      }
    });

    await tx.product.update({
      where: { id: params.id },
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
    entityId: params.id,
    message: "Ürün Trendyol'da arşive alındı."
  });

  return NextResponse.json({ success: true, publishStatus: "archived" });
}
