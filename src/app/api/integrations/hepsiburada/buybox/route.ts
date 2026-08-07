import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbBuyboxOrders } from "@/lib/hepsiburadaListings";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * GET /api/integrations/hepsiburada/buybox?skus=A,B,C
 * Maks. 10 SKU.
 */
export async function GET(request: Request) {
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
    const url = new URL(request.url);
    const skusParam = url.searchParams.get("skus")?.trim() ?? "";
    const skus = skusParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await getHbBuyboxOrders(ctx.storeId, skus);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 400 ? 400 : 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada buybox GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/buybox",
    });
  }
}
