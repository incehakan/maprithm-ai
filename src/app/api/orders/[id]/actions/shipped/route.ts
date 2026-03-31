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
    where: { id: params.id, storeId: ctx.storeId, isTestRecord: false },
    select: {
      id: true,
      shipmentPackageId: true,
      cargoTrackingNumber: true,
      cargoProviderName: true
    }
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { trackingNumber?: unknown; cargoProviderName?: unknown }
    | null;
  const trackingNumber =
    typeof body?.trackingNumber === "string"
      ? body.trackingNumber.trim()
      : order.cargoTrackingNumber ?? "";
  const cargoProviderName =
    typeof body?.cargoProviderName === "string"
      ? body.cargoProviderName.trim()
      : order.cargoProviderName ?? "";

  if (!trackingNumber) {
    return NextResponse.json(
      { success: false, error: "trackingNumber zorunludur." },
      { status: 400 }
    );
  }
  if (!cargoProviderName) {
    return NextResponse.json(
      { success: false, error: "cargoProviderName zorunludur." },
      { status: 400 }
    );
  }

  const payload: TrendyolPackageActionPayload = {
    trackingNumber,
    cargoProviderName
  };
  const status = "Shipped" as const;

  await logOrderOperationStarted(
    ctx,
    order.id,
    order.shipmentPackageId,
    "Shipped",
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
      data: {
        packageStatus: result.sentStatus,
        lastFetchedAt: new Date(),
        cargoTrackingNumber: trackingNumber,
        cargoProviderName: cargoProviderName
      }
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
    await logOrderOperationCompleted(ctx, order.id, "Shipped", result.trendyolData);

    return NextResponse.json({ success: true, packageStatus: result.sentStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Trendyol aksiyonu başarısız.";
    await logOrderOperationFailed(ctx, order.id, "Shipped", message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

