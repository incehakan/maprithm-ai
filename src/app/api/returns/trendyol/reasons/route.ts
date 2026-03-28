import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { fetchTrendyolReturnReasons } from "@/lib/trendyolReturns";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 401 });
  }
  try {
    requirePermission(ctx, "returns.view");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const storeId = ctx.storeId;
  const [returnReasons, issueRows] = await Promise.all([
    fetchTrendyolReturnReasons(),
    prisma.trendyolReturnReason.findMany({
      where: { storeId, platform: "trendyol", category: "claim_issue", isActive: true },
      orderBy: { name: "asc" },
      select: { code: true, name: true, rawData: true }
    })
  ]);

  const claimIssueReasons = issueRows.map((r) => ({
    id: r.code,
    name: r.name,
    rawData: r.rawData
  }));

  return NextResponse.json({
    success: true,
    returnReasons,
    claimIssueReasons
  });
}
