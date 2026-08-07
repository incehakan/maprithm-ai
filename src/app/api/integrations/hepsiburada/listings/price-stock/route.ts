import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { pushHbPriceStock } from "@/lib/hepsiburadaPriceStockPush";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * POST /api/integrations/hepsiburada/listings/price-stock
 * Tekil PUT (doğrulanmış pushHbPriceStock).
 * Body: { merchantSku, price?, availableStock?, dispatchTime? }
 */
export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const noStore = e instanceof Error && e.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      merchantSku?: string;
      price?: number;
      availableStock?: number;
      dispatchTime?: number;
    } | null;

    if (!body?.merchantSku?.trim()) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "merchantSku zorunludur.",
        httpStatus: 400,
      });
    }

    const result = await pushHbPriceStock(ctx.storeId, {
      merchantSku: body.merchantSku.trim(),
      price: body.price,
      availableStock: body.availableStock,
      dispatchTime: body.dispatchTime,
    });

    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Hepsiburada listings price-stock POST error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/listings/price-stock",
    });
  }
}
