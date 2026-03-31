import { NextResponse } from "next/server";
import { runXmlFeedSchedulerTick } from "@/lib/xmlFeedSyncScheduler";
import { getRequestId } from "@/lib/requestContext";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Harici zamanlayıcı (Vercel Cron, systemd timer, vb.) için.
 * Başlık: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization")?.trim() ?? "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (token !== secret) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
  }

  try {
    await runXmlFeedSchedulerTick();
    logger.info("xml_sync_cron_completed", {
      route: "/api/cron/xml-feed-sync",
      requestId
    });
    return NextResponse.json({
      success: true,
      message: "XML feed zamanlaması çalıştı.",
      requestId
    });
  } catch (e) {
    const payload = logAndBuildApiError({
      err: e,
      fallbackMessage: "Cron hatası",
      requestId,
      context: { route: "/api/cron/xml-feed-sync", job: "xml_sync" }
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
