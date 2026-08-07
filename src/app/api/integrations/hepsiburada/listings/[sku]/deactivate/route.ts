import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { deactivateHbListing } from "@/lib/hepsiburadaListings";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * POST .../listings/[sku]/deactivate
 * Deneysel: HTTP metodu dokümanda açıkça doğrulanmadı (POST çıkarımı).
 */
export async function POST(
  _request: Request,
  { params }: { params: { sku: string } }
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
    const result = await deactivateHbListing(ctx.storeId, params.sku);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 400 ? 400 : 502,
      });
    }
    return NextResponse.json({
      success: true,
      data: result.data,
      experimental: true,
      note: "HTTP metodu (POST) dokümanda açıkça doğrulanmadı.",
    });
  } catch (error) {
    console.error("Hepsiburada deactivate error:", error);
    return createErrorResponse(error, {
      route: "POST /api/integrations/hepsiburada/listings/[sku]/deactivate",
    });
  }
}
