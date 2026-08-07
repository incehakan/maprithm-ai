import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { updateBoxInfoOnTrendyol } from "@/lib/trendyolShipping";
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
  const body = (await request.json().catch(() => ({}))) as {
    boxQuantity?: number;
    deci?: number;
  };

  const boxQuantity =
    typeof body.boxQuantity === "number" && Number.isFinite(body.boxQuantity) && body.boxQuantity > 0
      ? Math.round(body.boxQuantity)
      : null;
  const deci =
    typeof body.deci === "number" && Number.isFinite(body.deci) && body.deci > 0 ? body.deci : null;

  if (boxQuantity == null || deci == null) {
    return NextResponse.json(
      { success: false, error: "boxQuantity ve deci zorunlu ve 0'dan büyük olmalı." },
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

  const api = await updateBoxInfoOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: pkg,
    boxQuantity,
    deci
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
      action: "BOX_INFO_UPDATE_FAILED",
      message: api.message,
      rawData: { boxQuantity, deci },
      activityAction: "TRENDYOL_BOX_INFO_UPDATE_FAILED",
      activityMessage: `Desi/koli bilgisi gönderilemedi: ${pkg}`
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
    action: "BOX_INFO_UPDATED",
    message: `Desi/koli bilgisi gönderildi: ${boxQuantity} koli, ${deci} desi`,
    rawData: { boxQuantity, deci },
    activityAction: "TRENDYOL_BOX_INFO_UPDATED",
    activityMessage: `Desi/koli bilgisi güncellendi: ${pkg}`
  });

  return NextResponse.json({ success: true, boxQuantity, deci });
}
