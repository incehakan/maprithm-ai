import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  bulkPushHbInventory,
  type HbInventoryUploadItem,
} from "@/lib/hepsiburadaPriceStockPush";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * POST /api/integrations/hepsiburada/listings/inventory-uploads
 * Body: { items: HbInventoryUploadItem[] } — max 4000
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
      items?: HbInventoryUploadItem[];
    } | null;

    if (!body?.items?.length) {
      return jsonError("VALIDATION_ERROR", {
        userMessage: "items alanı zorunludur.",
        httpStatus: 400,
      });
    }

    const result = await bulkPushHbInventory(ctx.storeId, body.items);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 400 ? 400 : 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada inventory-uploads POST error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/listings/inventory-uploads",
    });
  }
}
