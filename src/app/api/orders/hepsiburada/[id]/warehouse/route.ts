/**
 * POST /api/orders/hepsiburada/[id]/warehouse
 * updateHbPackageWarehouse — body: `{ warehouseId: string }`
 * (dokümanla doğrulandı 2026-08-03; canlı SIT teyidi bekliyor).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { extractHbPackageNumber } from "@/lib/hepsiburadaOrderActions";
import {
  updateHbPackageWarehouse,
  type HbWarehouseBody,
} from "@/lib/hepsiburadaPackageOps";

type Params = { params: { id: string } };

export async function POST(req: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }
  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const warehouseId =
    raw.warehouseId != null ? String(raw.warehouseId).trim() : "";
  if (!warehouseId) {
    return NextResponse.json(
      { success: false, error: "body.warehouseId zorunludur." },
      { status: 400 }
    );
  }
  const body: HbWarehouseBody = { warehouseId };

  const order = await prisma.marketplaceOrder.findFirst({
    where: { id: params.id, storeId: ctx.storeId, platform: "hepsiburada" },
    select: { id: true, shipmentPackageId: true, rawData: true },
  });
  if (!order) {
    return NextResponse.json({ success: false, error: "Sipariş bulunamadı." }, { status: 404 });
  }

  const packageNumber = extractHbPackageNumber(order);
  const result = await updateHbPackageWarehouse({
    storeId: ctx.storeId,
    packageNumber,
    body,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.message }, { status: 502 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
