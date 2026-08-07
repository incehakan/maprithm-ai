import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { pushHbPriceStockBatch, type HbPriceStockItem } from "@/lib/hepsiburadaPriceStockPush";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const noStore = e?.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch (e: any) {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError("VALIDATION_ERROR", {
      userMessage: "Geçersiz istek gövdesi.",
      httpStatus: 400,
    });
  }

  if (!body.items || !Array.isArray(body.items)) {
    return jsonError("VALIDATION_ERROR", {
      userMessage: "Geçerli bir 'items' dizisi sağlanmalıdır.",
      httpStatus: 400,
    });
  }

  try {
    const items = body.items as HbPriceStockItem[];
    const result = await pushHbPriceStockBatch(ctx.storeId, items);

    return NextResponse.json({
      success: true,
      data: result,
      message: "Fiyat ve stok güncellemeleri Hepsiburada'ya iletildi.",
    });
  } catch (error) {
    console.error("Hepsiburada price/inventory update POST error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/products/price-inventory",
    });
  }
}
