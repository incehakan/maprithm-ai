import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  sendHbShippedAction,
  persistHbActionResult,
  extractHbPackageNumber,
} from "@/lib/hepsiburadaOrderActions";

type Params = { params: { id: string } };

// NOT: HB'de ayrı bir "Shipped" (kargoya verildi) aksiyonu yoktur — bu route
// artık HB'nin "deliver" (teslim edildi) bildirimini tetikliyor. URL/aksiyon
// adı geriye dönük uyumluluk için "shipped" bırakıldı; UI tarafında "Teslim
// edildi" olarak sunulmalı.

export async function POST(_req: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
  try { requirePermission(ctx, "orders.manage"); } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, platform: "hepsiburada" },
    select: { id: true, shipmentPackageId: true, rawData: true },
  });
  if (!order) return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });

  const packageNumber = extractHbPackageNumber(order);

  const result = await sendHbShippedAction({ storeId: ctx.storeId, packageNumber });

  if (!result.ok) return NextResponse.json({ success: false, error: result.message }, { status: 502 });

  await persistHbActionResult({
    orderId: order.id,
    storeId: ctx.storeId,
    action: "shipped",
    sentStatus: result.sentStatus,
    trendyolData: result.trendyolData,
  });

  return NextResponse.json({ success: true, packageStatus: result.sentStatus });
}
