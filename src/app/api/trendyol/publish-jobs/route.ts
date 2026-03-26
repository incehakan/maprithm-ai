import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function getUserId(session: { user?: { id?: string } | null } | null) {
  return session?.user?.id ?? null;
}

/**
 * GET /api/trendyol/publish-jobs — kullanıcının batch işleri
 */
export async function GET() {
  const session = await auth();
  const userId = getUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const [jobs, mappingBatches] = await Promise.all([
    prisma.trendyolPublishJob.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 200
    }),
    prisma.productMarketplaceMapping.groupBy({
      by: ["batchRequestId"],
      where: {
        userId,
        platform: "trendyol",
        batchRequestId: { not: null }
      },
      _max: { updatedAt: true }
    })
  ]);

  const jobByBatch = new Map(jobs.map((j) => [j.batchRequestId, j]));

  type Row = {
    id: string;
    batchRequestId: string;
    batchStatus: string | null;
    itemCount: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
    batchRequestType: string | null;
    lastSyncMessage: string | null;
    updatedAt: string;
    createdAt: string;
  };

  const rows: Row[] = jobs.map((j) => ({
    id: j.id,
    batchRequestId: j.batchRequestId,
    batchStatus: j.batchStatus,
    itemCount: j.itemCount,
    successCount: j.successCount,
    failedCount: j.failedCount,
    pendingCount: j.pendingCount,
    batchRequestType: j.batchRequestType,
    lastSyncMessage: j.lastSyncMessage,
    updatedAt: j.updatedAt.toISOString(),
    createdAt: j.createdAt.toISOString()
  }));

  for (const row of mappingBatches) {
    const bid = row.batchRequestId;
    if (!bid || jobByBatch.has(bid)) continue;
    const u = row._max.updatedAt ?? new Date();
    rows.push({
      id: `m-${bid}`,
      batchRequestId: bid,
      batchStatus: null,
      itemCount: 0,
      successCount: 0,
      failedCount: 0,
      pendingCount: 0,
      batchRequestType: null,
      lastSyncMessage:
        "Yalnızca ürün eşlemesinde kayıtlı; detaydan sonuç kontrolü yapın.",
      updatedAt: u.toISOString(),
      createdAt: u.toISOString()
    });
  }

  rows.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return NextResponse.json({ jobs: rows.slice(0, 200) });
}
