import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { checkHbDeleteProcessStatus } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/** Silme başlatma (3.8) placeholder — yalnızca durum sorgusu (3.9). */
export async function GET(
  _request: Request,
  { params }: { params: { trackingId: string } }
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
    const result = await checkHbDeleteProcessStatus(ctx.storeId, params.trackingId);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada delete-status GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/products/delete-status/[trackingId]",
    });
  }
}
