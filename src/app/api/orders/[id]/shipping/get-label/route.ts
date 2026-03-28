import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordShippingOperationAudit } from "@/lib/orderShippingAudit";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchCommonLabelFromTrendyol } from "@/lib/trendyolShipping";

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
  const body = (await request.json().catch(() => ({}))) as { queryId?: string };

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: orderId, storeId: ctx.storeId }
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

  const queryId =
    (typeof body.queryId === "string" && body.queryId.trim()) ||
    order.cargoTrackingNumber?.trim() ||
    pkg;

  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: {
      shippingOperationStatus: "pending",
      shippingOperationLastErrorMessage: null
    }
  });

  const api = await fetchCommonLabelFromTrendyol({
    userId: ctx.userId,
    storeId: ctx.storeId,
    queryId
  });

  if (!api.ok) {
    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: {
        shippingOperationStatus: "error",
        shippingOperationLastErrorMessage: api.message.slice(0, 2000)
      }
    });
    await recordShippingOperationAudit({
      storeId: ctx.storeId,
      userId: ctx.userId,
      membershipId: ctx.membershipId,
      orderId: order.id,
      shipmentPackageId: pkg,
      action: "LABEL_FETCH_FAILED",
      message: api.message,
      rawData: { queryId },
      activityAction: "TRENDYOL_COMMON_LABEL_FETCH_FAILED",
      activityMessage: `Etiket alınamadı: ${pkg}`
    });
    return NextResponse.json({ success: false, error: api.message }, { status: 502 });
  }

  const { labelUrl, rawData, format } = api.result;
  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: {
      cargoLabelUrl: labelUrl,
      cargoLabelRawData:
        rawData === undefined || rawData === null
          ? Prisma.JsonNull
          : (rawData as Prisma.InputJsonValue),
      labelFetchedAt: new Date(),
      shippingOperationStatus: "success",
      shippingOperationLastErrorMessage: null
    }
  });

  await recordShippingOperationAudit({
    storeId: ctx.storeId,
    userId: ctx.userId,
    membershipId: ctx.membershipId,
    orderId: order.id,
    shipmentPackageId: pkg,
    action: "LABEL_FETCHED",
    message: labelUrl ? "Ortak etiket bilgisi alındı." : "Etiket yanıtı saklandı (URL yok).",
    rawData: { queryId, format, labelUrl },
    activityAction: "TRENDYOL_COMMON_LABEL_FETCHED",
    activityMessage: `Etiket: ${pkg}`
  });

  return NextResponse.json({
    success: true,
    labelUrl,
    format,
    hasRaw: rawData != null
  });
}
