import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { updateWarehouseOnTrendyol } from "@/lib/trendyolShipping";
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
  const body = (await request.json().catch(() => ({}))) as { warehouseId?: number };

  const warehouseId =
    typeof body.warehouseId === "number" && Number.isFinite(body.warehouseId)
      ? Math.round(body.warehouseId)
      : null;
  if (warehouseId == null) {
    return NextResponse.json(
      { success: false, error: "warehouseId zorunlu (sayı)." },
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

  const api = await updateWarehouseOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: pkg,
    warehouseId
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
      action: "WAREHOUSE_UPDATE_FAILED",
      message: api.message,
      rawData: { warehouseId },
      activityAction: "TRENDYOL_WAREHOUSE_UPDATE_FAILED",
      activityMessage: `Depo bilgisi güncellemesi başarısız: ${pkg}`
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
    action: "WAREHOUSE_UPDATED",
    message: `Depo bilgisi güncellendi: warehouseId=${warehouseId}`,
    rawData: { warehouseId },
    activityAction: "TRENDYOL_WAREHOUSE_UPDATED",
    activityMessage: `Depo bilgisi güncellendi: ${pkg}`
  });

  return NextResponse.json({ success: true, warehouseId });
}
