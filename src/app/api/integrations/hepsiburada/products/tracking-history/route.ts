import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbTrackingIdHistory } from "@/lib/hepsiburadaProductApi";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

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
    const page = url.searchParams.get("page");
    const size = url.searchParams.get("size");
    const sort = url.searchParams.get("sort") ?? undefined;

    const result = await getHbTrackingIdHistory(ctx.storeId, {
      page: page != null ? Number(page) : undefined,
      size: size != null ? Number(size) : undefined,
      sort,
    });
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada tracking history GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/products/tracking-history",
    });
  }
}
