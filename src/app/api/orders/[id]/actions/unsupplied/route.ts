import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { sendUnsuppliedToTrendyol } from "@/lib/trendyolOrderOperations";
import { TRENDYOL_ORDER_INGEST_SOURCE } from "@/lib/trendyolOrderIngestFromPackage";
import { Prisma } from "@prisma/client";
import {
  logOrderOperationCompleted,
  logOrderOperationFailed,
  logOrderOperationStarted
} from "@/lib/trendyolOrderOperationLog";

type Params = { params: { id: string } };

export async function POST(request: Request, { params }: Params) {
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

  const body = (await request.json().catch(() => null)) as
    | {
        reasonId?: unknown;
        lines?: Array<{ lineId?: string | null; quantity?: number | null }>;
      }
    | null;
  const reasonId =
    typeof body?.reasonId === "number"
      ? body.reasonId
      : typeof body?.reasonId === "string" && body.reasonId.trim() !== ""
        ? Number(body.reasonId)
        : undefined;

  const lines = Array.isArray(body?.lines) ? body.lines : undefined;

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Unsupplied",
    {
      ...(reasonId != null && Number.isFinite(reasonId) ? { reasonId } : {}),
      ...(lines ? { lines } : {})
    }
  );

  try {
    const result = await sendUnsuppliedToTrendyol({
      userId: ctx.userId,
      storeId: ctx.storeId,
      shipmentPackageId: order.shipmentPackageId,
      ...(reasonId != null && Number.isFinite(reasonId) ? { reasonId } : {}),
      ...(lines ? { lines } : {})
    });

    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: {
        packageStatus: result.sentStatus,
        lastFetchedAt: new Date(),
        packageStatusUpdatedAt: new Date(),
        lastIngestSource: TRENDYOL_ORDER_INGEST_SOURCE.OPERATION
      }
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "UNSUPPLIED_SENT",
        message: "Unsupplied işlemi Trendyol'a gönderildi.",
        previousStatus: order.packageStatus,
        nextStatus: result.sentStatus,
        relatedShipmentPackageId: order.shipmentPackageId,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
    await logOrderOperationCompleted(ctx, order.id, "Unsupplied", result.trendyolData);

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Unsupplied", message);
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

