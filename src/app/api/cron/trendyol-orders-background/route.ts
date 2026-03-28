/**
 * Arka plan Trendyol sipariş senkronu.
 * Öneri: dış cron (her 5 dk) GET veya POST ile çağrılsın; Authorization: Bearer CRON_SECRET
 */
import { NextResponse } from "next/server";
import {
  processOrderSyncQueue,
  tickTrendyolOrderBackgroundCron
} from "@/lib/trendyolOrderBackgroundSync";

export const dynamic = "force-dynamic";

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === secret;
}

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  try {
    const result = await tickTrendyolOrderBackgroundCron();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      processOnly?: boolean;
    };
    if (body.processOnly === true) {
      await processOrderSyncQueue({ maxJobs: 20 });
      return NextResponse.json({ success: true, processOnly: true });
    }
    const result = await tickTrendyolOrderBackgroundCron();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
