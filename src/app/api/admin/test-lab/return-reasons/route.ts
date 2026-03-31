import { NextResponse } from "next/server";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { fetchTrendyolReturnReasons } from "@/lib/trendyolReturns";

export async function GET() {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const reasons = await fetchTrendyolReturnReasons();
  return NextResponse.json({ success: true, reasons });
}

