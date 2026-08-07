/**
 * POST /api/integrations/hepsiburada/price-stock
 *
 * Hepsiburada'da fiyat ve/veya stok günceller.
 *
 * Body:
 *   {
 *     items: Array<{
 *       merchantSku: string;
 *       price?: number;
 *       availableStock?: number;
 *       dispatchTime?: number;
 *     }>
 *   }
 *
 * Bu route doğrulanmış tekil PUT'u döngüyle çağıran pushHbPriceStockBatch
 * kullanır (güvenli fallback). Toplu inventory-uploads için:
 * POST /api/integrations/hepsiburada/listings/inventory-uploads
 */

import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  pushHbPriceStockBatch,
  type HbPriceStockItem,
} from "@/lib/hepsiburadaPriceStockPush";

export async function POST(request: Request) {
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
    requirePermission(ctx, "products.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    items?: HbPriceStockItem[];
  } | null;

  const items = body?.items;
  if (!items?.length) {
    return NextResponse.json({ success: false, error: "items alanı zorunludur." }, { status: 400 });
  }

  try {
    const result = await pushHbPriceStockBatch(ctx.storeId, items);
    return NextResponse.json({
      success: true,
      mode: "batch",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Güncelleme başarısız.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
