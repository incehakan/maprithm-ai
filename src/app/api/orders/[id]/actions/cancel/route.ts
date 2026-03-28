import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  updatePackageStatus,
  type TrendyolPackageActionPayload
} from "@/lib/trendyolOrderActions";
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
    where: { id: params.id, storeId: ctx.storeId },
    select: { id: true, shipmentPackageId: true }
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { reasonId?: unknown; lines?: Array<{ lineId?: string | null; quantity?: number | null }> }
    | null;
  const reasonId =
    typeof body?.reasonId === "number"
      ? body.reasonId
      : typeof body?.reasonId === "string" && body.reasonId.trim() !== ""
        ? Number(body.reasonId)
        : undefined;

  const payload: TrendyolPackageActionPayload = {
    ...(reasonId != null && Number.isFinite(reasonId) ? { reasonId } : {}),
    ...(Array.isArray(body?.lines) ? { lines: body?.lines } : {})
  };
  const status = "Cancel" as const;

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Cancel",
    payload
  );

  try {
    const result = await updatePackageStatus(
      ctx.userId,
      ctx.storeId,
      order.shipmentPackageId,
      status,
      payload
    );

    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: { packageStatus: result.sentStatus, lastFetchedAt: new Date() }
    });

    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId: ctx.storeId,
        orderId: order.id,
        action: "TRENDYOL_PACKAGE_SYNCED",
        message: `Paket durumu güncellendi: ${result.sentStatus}`,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });
    await logOrderOperationCompleted(ctx, order.id, "Cancel", result.trendyolData);

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Cancel", message);

    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

