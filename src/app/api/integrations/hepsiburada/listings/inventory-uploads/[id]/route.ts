import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbInventoryUploadStatus } from "@/lib/hepsiburadaPriceStockPush";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * GET /api/integrations/hepsiburada/listings/inventory-uploads/[id]
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
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
    const result = await getHbInventoryUploadStatus(ctx.storeId, params.id);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 400 ? 400 : 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada inventory-uploads status GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/listings/inventory-uploads/[id]",
    });
  }
}
