import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { splitShipmentPackageOnTrendyol } from "@/lib/trendyolShipping";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 401 });
  }
  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const { id: orderId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { orderLineIds?: number[] };

  const orderLineIds = Array.isArray(body.orderLineIds)
    ? body.orderLineIds
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    : [];

  if (orderLineIds.length === 0) {
    return NextResponse.json(
      { success: false, error: "En az bir orderLineId gerekli." },
      { status: 400 }
    );
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId: ctx.storeId, isTestRecord: false }
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const pkg = order.shipmentPackageId?.trim();
  if (!pkg) {
    return NextResponse.json(
      { success: false, error: "shipmentPackageId eksik." },
      { status: 400 }
    );
  }

  await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
    shippingOperationStatus: "pending",
    shippingOperationLastErrorMessage: null
  });

  const api = await splitShipmentPackageOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: pkg,
    orderLineIds
  });

  if (!api.ok) {
    await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
      shippingOperationStatus: "error",
      shippingOperationLastErrorMessage: api.message.slice(0, 2000)
    });
    await recordShippingOperationAudit({
      storeId: ctx.storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      orderId: order.id,
      shipmentPackageId: pkg,
      action: "PACKAGE_SPLIT_FAILED",
      message: api.message,
      rawData: { orderLineIds },
      activityAction: "TRENDYOL_PACKAGE_SPLIT_FAILED",
      activityMessage: `Paket bölme isteği başarısız: ${pkg}`
    });
    return NextResponse.json({ success: false, error: api.message }, { status: 502 });
  }

  await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
    shippingOperationStatus: "success",
    shippingOperationLastErrorMessage: null
  });

  await recordShippingOperationAudit({
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    orderId: order.id,
    shipmentPackageId: pkg,
    action: "PACKAGE_SPLIT_REQUESTED",
    message: `Paket bölme isteği gönderildi: ${orderLineIds.length} satır ayrıldı`,
    rawData: { orderLineIds },
    activityAction: "TRENDYOL_PACKAGE_SPLIT_REQUESTED",
    activityMessage: `Paket bölme isteği gönderildi: ${pkg}`
  });

  return NextResponse.json({
    success: true,
    message:
      "Bölme isteği Trendyol'a gönderildi. Yeni paket(ler) asenkron oluşacak; sipariş senkronunu birkaç dakika sonra tekrar çalıştırın."
  });
}
