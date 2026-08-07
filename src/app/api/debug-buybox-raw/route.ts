import { NextResponse } from "next/server";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { getTrendyolProductBase, parseTrendyolContentIdFromProductBase } from "@/lib/trendyolProductApiV2";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode") ?? "";
  const conn = await prisma.marketplaceConnection.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "trendyol" } }
  });
  const sellerId = String(conn?.sellerId ?? "").trim();
  const res = await getTrendyolProductBase({
    userId: ctx.userId,
    storeId: ctx.storeId,
    sellerId,
    barcode
  });
  const parsed = res.ok ? parseTrendyolContentIdFromProductBase(res.data) : null;
  return NextResponse.json({ res, parsed });
}
