import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbListings } from "@/lib/hepsiburadaListings";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

/**
 * GET /api/integrations/hepsiburada/listings
 * Query: offset, limit (zorunlu), hepsiburadaSkus, merchantSkus, salableListings
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
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const hbSkus = url.searchParams.get("hepsiburadaSkus")?.trim();
    const mSkus = url.searchParams.get("merchantSkus")?.trim();
    const salable = url.searchParams.get("salableListings");

    const result = await getHbListings(ctx.storeId, {
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : 50,
      hepsiburadaSkus: hbSkus
        ? hbSkus.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      merchantSkus: mSkus
        ? mSkus.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      salableListings:
        salable === "true" ? true : salable === "false" ? false : undefined,
    });

    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 400 ? 400 : 502,
      });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("Hepsiburada listings GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/listings",
    });
  }
}
