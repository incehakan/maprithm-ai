import { NextResponse } from "next/server";
import { syncGlobalTrendyolReferenceData } from "@/lib/trendyolReferenceSync";

export const dynamic = "force-dynamic";

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
    const result = await syncGlobalTrendyolReferenceData();
    return NextResponse.json({
      success: true,
      schedule: "daily",
      summary: `brands=${result.brands}, categories=${result.categories}, attributes=${result.categoryAttributes}, values=${result.categoryAttributeValues}`,
      ...result
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Global referans sync hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

