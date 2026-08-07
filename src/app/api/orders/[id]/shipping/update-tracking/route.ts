import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { matchOrderCargoProvider } from "@/lib/trendyolCarrier";
import {
  buildLocalTrackingLinkAfterUpdate,
  resolveProviderNameFromReference,
  updateTrackingNumberOnTrendyol,
  validateTrackingPayload
} from "@/lib/trendyolShipping";
import { logger } from "@/lib/logger";
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
  const body = await request.json().catch(() => null);
  const v = validateTrackingPayload(body);
  if (!v.ok) {
    return NextResponse.json({ success: false, error: v.message }, { status: 400 });
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

  const api = await updateTrackingNumberOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: pkg,
    payload: v.value
  });

  if (!api.ok) {
    logger.error("tracking_update_failed", {
      route: "/api/orders/[id]/shipping/update-tracking",
      storeId: ctx.storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      shipmentPackageId: pkg,
      error: api.message
    });
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
      action: "TRACKING_UPDATE_FAILED",
      message: api.message,
      rawData: { step: "trendyol_api" },
      activityAction: "TRENDYOL_TRACKING_UPDATE_FAILED",
      activityMessage: `Takip güncellenemedi: ${pkg}`
    });
    return NextResponse.json({ success: false, error: api.message }, { status: 502 });
  }

  const nameFromRef = await resolveProviderNameFromReference(v.value.providerCode);
  // Mağaza MarketplaceCarrier + global referans ile zenginleştir
  const matched = await matchOrderCargoProvider({
    storeId: ctx.storeId,
    providerCode: v.value.providerCode,
    providerName: nameFromRef ?? order.cargoProviderName
  });
  const displayName =
    matched.providerName ?? nameFromRef ?? order.cargoProviderName ?? v.value.providerCode;
  const resolvedCode = matched.providerCode || v.value.providerCode;
  const link = buildLocalTrackingLinkAfterUpdate(
    v.value.trackingNumber,
    resolvedCode,
    displayName
  );

  await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
    cargoTrackingNumber: v.value.trackingNumber,
    cargoSenderNumber: v.value.cargoSenderNumber,
    cargoProviderCode: resolvedCode,
    cargoProviderName: displayName,
    cargoTrackingLink: link ?? order.cargoTrackingLink,
    trackingUpdatedAt: new Date(),
    shippingOperationStatus: "success",
    shippingOperationLastErrorMessage: null
  });

  await recordShippingOperationAudit({
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    orderId: order.id,
    shipmentPackageId: pkg,
    action: "TRACKING_UPDATED",
    message: "Takip numarası Trendyol ile güncellendi.",
    rawData: {
      providerCode: resolvedCode,
      trackingNumber: v.value.trackingNumber,
      matchedFrom: matched.matchedFrom
    },
    activityAction: "TRENDYOL_TRACKING_UPDATED",
    activityMessage: `Takip güncellendi: ${pkg}`
  });

  return NextResponse.json({ success: true });
}
