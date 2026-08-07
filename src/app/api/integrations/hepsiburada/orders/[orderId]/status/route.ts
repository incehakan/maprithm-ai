import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  sendHbPickingAction,
  sendHbCancelActionSafe,
  extractHbPackageNumber,
  type HbPackageActionResult,
} from "@/lib/hepsiburadaOrderActions";

export async function POST(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    let ctx;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      return NextResponse.json({ error: e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz." }, { status: 401 });
    }
    
    try {
      requirePermission(ctx, "marketplace.integrations.manage");
    } catch {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const { status, reasonId, lineItemId } = await req.json();
    if (!status) {
      return NextResponse.json({ error: "Status parametresi zorunludur." }, { status: 400 });
    }

    const order = await prisma.marketplaceOrder.findFirst({
      where: { id: params.orderId, storeId: ctx.storeId, platform: "hepsiburada" },
      select: { id: true, shipmentPackageId: true, rawData: true, packageStatus: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Sipariş bulunamadı." }, { status: 404 });
    }

    // HB'de tek bir generic "status update" uç noktası yok; status değerine göre
    // ilgili aksiyona yönlendirir. "Picking" artık HB'nin gerçek "paketleme"
    // aksiyonuna (bkz. hepsiburadaOrderActions.ts) karşılık geliyor. "Cancel"
    // KALEM bazlıdır ve reasonId + lineItemId zorunludur.
    let result: HbPackageActionResult;
    const normalized = String(status).trim().toLowerCase();
    if (normalized === "picking") {
      const lines = await prisma.marketplaceOrderLine.findMany({
        where: { orderId: order.id, storeId: ctx.storeId },
        select: { lineId: true, quantity: true },
      });
      const lineItems = lines
        .filter((l) => l.lineId)
        .map((l) => ({ id: l.lineId as string, quantity: l.quantity }));
      result = await sendHbPickingAction({ storeId: ctx.storeId, lineItems });
    } else if (normalized === "cancelled" || normalized === "cancel") {
      if (!lineItemId || reasonId == null) {
        return NextResponse.json(
          { error: "İptal için lineItemId ve reasonId zorunludur." },
          { status: 400 }
        );
      }
      result = await sendHbCancelActionSafe({
        storeId: ctx.storeId,
        lineItemId,
        reasonId,
        packageNumber:
          (order.packageStatus ?? "").trim().toLowerCase() === "open"
            ? undefined
            : extractHbPackageNumber(order),
      });
    } else {
      return NextResponse.json(
        {
          error:
            "Desteklenmeyen status değeri. 'picking' veya 'cancelled' kullanın; paketleme/kargo için ilgili aksiyon endpoint'ini kullanın.",
        },
        { status: 400 }
      );
    }

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Hepsiburada order status update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
