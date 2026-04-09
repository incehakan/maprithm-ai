import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { trendyolPostJson } from "@/lib/trendyolFetch";
import { extractBatchRequestId } from "@/lib/trendyolCreateProductPayload";
import {
  buildPriceStockUpdatePayload,
  resolveMarketplaceListPrice,
  resolveMarketplaceQuantity,
  resolveMarketplaceSalePrice
} from "@/lib/trendyolMarketplaceCommercials";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  markMarketplaceSyncFailed,
  markMarketplaceSyncSuccess
} from "@/lib/xml-sync/marketplaceSyncState";
import { MarketplaceSyncSource } from "@/lib/xml-sync/types";

type Body = { productId?: string };

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "pricing.update");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const productId = body?.productId?.trim() ?? "";
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
    return NextResponse.json({ error: "Trendyol mapping kaydı bulunamadı." }, { status: 400 });
  }
  if (mapping.storeId !== ctx.storeId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const barcode = String(mapping.barcode ?? "").trim();
  if (!barcode) {
    return NextResponse.json({ error: "Barkod bulunamadı" }, { status: 400 });
  }

  const salePrice = resolveMarketplaceSalePrice(
    { price: Number(product.price), stock: product.stock },
    mapping
  );
  const listPrice = resolveMarketplaceListPrice(
    { price: Number(product.price), stock: product.stock },
    mapping
  );
  const quantity = resolveMarketplaceQuantity(
    { price: Number(product.price), stock: product.stock },
    mapping
  );

  if (salePrice == null || !Number.isFinite(salePrice) || salePrice <= 0) {
    return NextResponse.json({ error: "Satış fiyatı geçersiz" }, { status: 400 });
  }
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) {
    return NextResponse.json({ error: "Stok değeri geçersiz" }, { status: 400 });
  }

  const payload = buildPriceStockUpdatePayload({
    product: { price: Number(product.price), stock: product.stock },
    mapping
  });
  if (!payload) {
    return NextResponse.json(
      { error: "Fiyat/stok güncellemesi gönderilemedi" },
      { status: 400 }
    );
  }

  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  if (!conn?.isActive || !sellerId) {
    return NextResponse.json({ error: "Trendyol bağlantısı bulunamadı" }, { status: 400 });
  }

  const path = `/integration/inventory/sellers/${encodeURIComponent(
    sellerId
  )}/products/price-and-inventory`;
  const apiResult = await trendyolPostJson<unknown>(ctx.userId, ctx.storeId, path, payload);

  if (!apiResult.ok) {
    await prisma.productMarketplaceMapping.updateMany({
      where: { id: mapping.id, storeId: ctx.storeId },
      data: {
        lastErrorMessage: apiResult.message.slice(0, 2000),
        lastSyncAt: new Date()
      }
    });
    await markMarketplaceSyncFailed({
      productId,
      storeId: ctx.storeId,
      source: MarketplaceSyncSource.MANUAL_PRICE_STOCK_UPDATE,
      errorMessage: apiResult.message,
      userId: ctx.userId,
      membershipId: ctx.membershipId
    });
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_PRICE_STOCK_UPDATE_FAILED",
      entityType: "PRODUCT",
      entityId: productId,
      message: "Trendyol fiyat/stok güncellemesi başarısız oldu"
    });
    return NextResponse.json(
      { error: "Fiyat/stok güncellemesi gönderilemedi" },
      { status: apiResult.status >= 400 ? apiResult.status : 502 }
    );
  }

  const batchRequestId = extractBatchRequestId(apiResult.data);
  const now = new Date();

  await prisma.productMarketplaceMapping.updateMany({
    where: { id: mapping.id, storeId: ctx.storeId },
    data: {
      batchRequestId: batchRequestId ?? mapping.batchRequestId ?? null,
      publishStatus: "processing",
      lastSyncAt: now,
      lastErrorMessage: null
    }
  });

  await markMarketplaceSyncSuccess({
    productId,
    storeId: ctx.storeId,
    source: MarketplaceSyncSource.MANUAL_PRICE_STOCK_UPDATE,
    userId: ctx.userId,
    membershipId: ctx.membershipId
  });

  if (batchRequestId) {
    await prisma.trendyolPublishJob.upsert({
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
        batchRequestType: "ProductInventoryUpdate",
        lastSyncMessage: "Fiyat/stok güncelleme isteği Trendyol kuyruğuna alındı."
      },
      update: {
        batchStatus: "IN_PROGRESS",
        itemCount: 1,
        pendingCount: 1,
        batchRequestType: "ProductInventoryUpdate",
        lastSyncMessage: "Fiyat/stok güncelleme isteği Trendyol kuyruğuna alındı."
      }
    });
  }

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_PRICE_STOCK_UPDATE_REQUESTED",
    entityType: "PRODUCT",
    entityId: productId,
    message: "Trendyol fiyat/stok güncellemesi gönderildi"
  });

  return NextResponse.json({
    success: true,
    batchRequestId,
    payloadPreview: {
      barcode,
      salePrice,
      listPrice: listPrice ?? salePrice,
      quantity
    },
    message: "Fiyat/stok güncellemesi Trendyol'a gönderildi."
  });
}
