import { NextResponse } from "next/server";
import { syncGlobalTrendyolReferenceData } from "@/lib/trendyolReferenceSync";
import { getRequestId } from "@/lib/requestContext";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization")?.trim() ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token !== secret) {
      return NextResponse.json({ error: "Yetkisiz", requestId }, { status: 401 });
    }
  }

  try {
    const result = await syncGlobalTrendyolReferenceData();
    logger.info("reference_sync_cron_completed", {
      route: "/api/cron/daily-reference-sync",
      requestId
    });
    return NextResponse.json({
      success: true,
      schedule: "daily",
      summary: `brands=${result.brands}, categories=${result.categories}, attributes=${result.categoryAttributes}, values=${result.categoryAttributeValues}`,
      ...result,
      requestId
    });
  } catch (e) {
    const payload = logAndBuildApiError({
      err: e,
      fallbackMessage: "Global referans sync hatası",
      requestId,
      context: { route: "/api/cron/daily-reference-sync", job: "reference_sync" }
    });
    return NextResponse.json(payload, { status: 500 });
  }
}

