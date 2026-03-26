import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  updatePackageStatus,
  type TrendyolPackageActionPayload
} from "@/lib/trendyolOrderActions";
import { Prisma } from "@prisma/client";

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
    where: { id: params.id, storeId: ctx.storeId },
    select: { id: true, shipmentPackageId: true }
  });

  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const status = "Picking" as const;
  const payload: TrendyolPackageActionPayload = {};

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "TRENDYOL_ORDER_ACTION_SENT",
    entityType: "marketplace_order",
    entityId: order.id,
    message: `Trendyol paket aksiyonu gönderildi: ${status} (packageId=${order.shipmentPackageId})`
  });

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
        action: `TRENDYOL_ORDER_ACTION_${result.sentStatus}`,
        message: `Paket durumu güncellendi: ${result.sentStatus}`,
        rawData: (result.trendyolData ?? Prisma.JsonNull) as Prisma.InputJsonValue
      }
    });

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_ORDER_ACTION_FAILED",
      entityType: "marketplace_order",
      entityId: order.id,
      message
    });

    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

