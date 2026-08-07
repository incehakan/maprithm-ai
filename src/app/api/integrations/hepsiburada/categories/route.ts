import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchHbCategories } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function GET(request: Request) {
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

  try {
    const result = await fetchHbCategories(ctx.storeId);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true, data: result.categories });
  } catch (error) {
    console.error("Hepsiburada categories GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/categories",
    });
  }
}
