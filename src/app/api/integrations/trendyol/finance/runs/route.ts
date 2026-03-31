import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "trendyol.finance.view");
  } catch {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
  }

  const runs = await prisma.trendyolFinanceSyncRun.findMany({
    where: { storeId: ctx.storeId },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      kind: true,
      supplierId: true,
      startDateMs: true,
      endDateMs: true,
      transactionType: true,
      transactionTypes: true,
      pageFetched: true,
      pageSize: true,
      httpStatus: true,
      success: true,
      errorMessage: true,
      totalPages: true,
      totalElements: true,
      createdAt: true
    }
  });

  return NextResponse.json({
    runs: runs.map((r) => ({
      ...r,
      startDateMs: r.startDateMs.toString(),
      endDateMs: r.endDateMs.toString(),
      createdAt: r.createdAt.toISOString()
    }))
  });
}
