import { NextResponse } from "next/server";
import { runXmlFeedSchedulerTick } from "@/lib/xmlFeedSyncScheduler";

export const dynamic = "force-dynamic";

/**
 * Harici zamanlayıcı (Vercel Cron, systemd timer, vb.) için.
 * Başlık: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
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
    return NextResponse.json({ success: true, message: "XML feed zamanlaması çalıştı." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron hatası";
    console.error("[cron/xml-feed-sync]", e);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
