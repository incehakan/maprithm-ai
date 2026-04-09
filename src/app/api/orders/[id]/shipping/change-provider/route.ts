import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { resolveCarrierDisplayName } from "@/lib/trendyolCarrier";
import { changeCargoProviderOnTrendyol } from "@/lib/trendyolShipping";
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
    providerCode?: string;
    providerName?: string;
  };

  const providerCode =
    typeof body.providerCode === "string" ? body.providerCode.trim() : "";
  if (!providerCode || !/^[A-Za-z0-9._\-]{1,64}$/.test(providerCode)) {
    return NextResponse.json(
      { success: false, error: "providerCode zorunlu ve geçerli olmalı." },
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

  const st = order.packageStatus ?? "";
  const blocked = ["Delivered", "Cancelled", "Returned"].some((x) =>
    st.toLowerCase().includes(x.toLowerCase())
  );
  if (blocked) {
    return NextResponse.json(
      {
        success: false,
        error: "Bu paket durumunda kargo sağlayıcı değiştirilemez."
      },
      { status: 400 }
    );
  }

  await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
    shippingOperationStatus: "pending",
    shippingOperationLastErrorMessage: null
  });

  const api = await changeCargoProviderOnTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    shipmentPackageId: pkg,
    providerCode
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
      action: "CARGO_PROVIDER_CHANGE_FAILED",
      message: api.message,
      rawData: { providerCode },
      activityAction: "TRENDYOL_CARGO_PROVIDER_CHANGE_FAILED",
      activityMessage: `Kargo sağlayıcı değişmedi: ${pkg}`
    });
    return NextResponse.json({ success: false, error: api.message }, { status: 502 });
  }

  const ref = await prisma.marketplaceCarrierReference.findFirst({
    where: { platform: "trendyol", providerCode, isActive: true },
    select: { providerName: true }
  });
  const displayName =
    (typeof body.providerName === "string" && body.providerName.trim()) ||
    ref?.providerName ||
    resolveCarrierDisplayName(providerCode, null);

  await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
    cargoProviderCode: providerCode,
    cargoProviderName: displayName,
    cargoProviderChangedAt: new Date(),
    shippingOperationStatus: "success",
    shippingOperationLastErrorMessage: null
  });

  await recordShippingOperationAudit({
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    orderId: order.id,
    shipmentPackageId: pkg,
    action: "CARGO_PROVIDER_CHANGED",
    message: `Kargo sağlayıcı güncellendi: ${displayName}`,
    rawData: { providerCode, providerName: displayName },
    activityAction: "TRENDYOL_CARGO_PROVIDER_CHANGED",
    activityMessage: `Kargo sağlayıcı değişti: ${pkg}`
  });

  return NextResponse.json({ success: true, cargoProviderName: displayName });
}
