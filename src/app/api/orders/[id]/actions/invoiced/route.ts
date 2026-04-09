import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { sendInvoicedToTrendyol } from "@/lib/trendyolOrderOperations";
import { TRENDYOL_ORDER_INGEST_SOURCE } from "@/lib/trendyolOrderIngestFromPackage";
import { Prisma } from "@prisma/client";
import {
  logOrderOperationCompleted,
  logOrderOperationFailed,
  logOrderOperationStarted
} from "@/lib/trendyolOrderOperationLog";
import { secureMarketplaceOrderUpdateMany } from "@/lib/security/storeScope";
import { jsonError } from "@/lib/errors/errorResponse";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const noStore = e?.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return jsonError("FORBIDDEN", {
      userMessage: "Bu işlem için yetkiniz yok.",
      httpStatus: 403
    });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, isTestRecord: false },
    select: { id: true, shipmentPackageId: true, packageStatus: true }
  });
  if (!order) {
    return jsonError("NOT_FOUND", {
      userMessage: "Sipariş bulunamadı.",
      httpStatus: 404
    });
  }

  const body = (await request.json().catch(() => null)) as
    | { invoiceNumber?: unknown }
    | null;
  const invoiceNumber =
    typeof body?.invoiceNumber === "string" ? body.invoiceNumber.trim() : undefined;

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Invoiced",
    { invoiceNumber }
  );

  try {
    const result = await sendInvoicedToTrendyol({
      userId: ctx.userId,
      storeId: ctx.storeId,
      shipmentPackageId: order.shipmentPackageId,
      invoiceNumber
    });

    await secureMarketplaceOrderUpdateMany(order.id, ctx.storeId, {
      packageStatus: result.sentStatus,
      lastFetchedAt: new Date(),
      packageStatusUpdatedAt: new Date(),
      lastIngestSource: TRENDYOL_ORDER_INGEST_SOURCE.OPERATION,
      invoiceNumber: invoiceNumber ?? undefined
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "INVOICED_SENT",
        message: "Invoiced işlemi Trendyol'a gönderildi.",
        previousStatus: order.packageStatus,
        nextStatus: result.sentStatus,
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
    await logOrderOperationCompleted(ctx, order.id, "Invoiced", result.trendyolData);

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Invoiced", message);
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

