import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { sendPickingToTrendyol } from "@/lib/trendyolOrderOperations";
import { TRENDYOL_ORDER_INGEST_SOURCE } from "@/lib/trendyolOrderIngestFromPackage";
import { Prisma } from "@prisma/client";
import {
  logOrderOperationCompleted,
  logOrderOperationFailed,
  logOrderOperationStarted
} from "@/lib/trendyolOrderOperationLog";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, isTestRecord: false },
    select: { id: true, shipmentPackageId: true, packageStatus: true }
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Picking",
    null
  );

  try {
    const result = await sendPickingToTrendyol({
      userId: ctx.userId,
      storeId: ctx.storeId,
      shipmentPackageId: order.shipmentPackageId
    });

    await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
      packageStatus: result.sentStatus,
      lastFetchedAt: new Date(),
      packageStatusUpdatedAt: new Date(),
      lastIngestSource: TRENDYOL_ORDER_INGEST_SOURCE.OPERATION
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "PICKING_SENT",
        message: "Picking işlemi Trendyol'a gönderildi.",
        previousStatus: order.packageStatus,
        nextStatus: result.sentStatus,
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
    await logOrderOperationCompleted(ctx, order.id, "Picking", result.trendyolData);

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Picking", message);
    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "ORDER_OPERATION_FAILED",
        message,
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: Prisma.JsonNull
      }
    });

    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

