/**
 * Arka plan Hepsiburada sipariş senkronu.
 * Öneri: dış cron (her 5 dk) GET veya POST ile çağrılsın; Authorization: Bearer CRON_SECRET
 */
import { NextResponse } from "next/server";
import {
  processHbOrderSyncQueue,
  tickHbOrderBackgroundCron
} from "@/lib/hepsiburadaOrderBackgroundSync";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/requestContext";
import { logAndBuildApiError } from "@/lib/errorHandling";

export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  if (!authorize(request)) {
    return NextResponse.json({ error: "Yetkisiz", requestId }, { status: 401 });
  }
  try {
    const result = await tickHbOrderBackgroundCron();
    logger.info("hb_order_sync_cron_completed", {
      route: "/api/cron/hepsiburada-orders-background",
      requestId
    });
    return NextResponse.json({ success: true, ...result, requestId });
  } catch (e) {
    const payload = logAndBuildApiError({
      err: e,
      fallbackMessage: "Cron hatası",
      requestId,
      context: { route: "/api/cron/hepsiburada-orders-background", job: "hb_order_sync" }
    });
    return NextResponse.json(payload, { status: 500 });
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  if (!authorize(request)) {
    return NextResponse.json({ error: "Yetkisiz", requestId }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      processOnly?: boolean;
    };
    if (body.processOnly === true) {
      const result = await processHbOrderSyncQueue({ maxJobs: 20 });
      return NextResponse.json({ success: true, processOnly: true, ...result, requestId });
    }
    const result = await tickHbOrderBackgroundCron();
    return NextResponse.json({ success: true, ...result, requestId });
  } catch (e) {
    const payload = logAndBuildApiError({
      err: e,
      fallbackMessage: "Cron hatası",
      requestId,
      context: { route: "/api/cron/hepsiburada-orders-background", job: "hb_order_sync" }
    });
    return NextResponse.json(payload, { status: 500 });
  }
}
