import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { getHbCampaignLimits } from "@/lib/hepsiburadaCampaigns";
import { jsonError, createErrorResponse } from "@/lib/errors/errorResponse";

export async function GET() {
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
    const result = await getHbCampaignLimits(ctx.storeId);
    if (!result.ok) {
      return jsonError("INTERNAL_ERROR", {
        userMessage: result.message,
        httpStatus: result.status === 401 ? 401 : 502,
      });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error("HB campaigns limits GET error:", error);
    return createErrorResponse(error, {
      route: "GET /api/integrations/hepsiburada/campaigns/limits",
    });
  }
}
