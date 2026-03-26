import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { batchRequestId: string } };

function decodeBatchId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * GET /api/trendyol/publish-jobs/[batchRequestId]
 */
export async function GET(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const batchRequestId = decodeBatchId(params.batchRequestId).trim();
  if (!batchRequestId) {
    return NextResponse.json({ error: "Geçersiz batch kimliği." }, { status: 400 });
  }

  const [job, mappings] = await Promise.all([
    prisma.trendyolPublishJob.findUnique({
      where: {
        storeId_batchRequestId: { storeId: ctx.storeId, batchRequestId }
      }
    }),
    prisma.productMarketplaceMapping.findMany({
      where: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        platform: "trendyol",
        batchRequestId
      },
      include: {
        product: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: "desc" }
    })
  ]);

  if (!job && mappings.length === 0) {
    return NextResponse.json(
      { error: "Bu batch kaydı bulunamadı." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    batchRequestId,
    job: job
      ? {
          id: job.id,
          batchStatus: job.batchStatus,
          itemCount: job.itemCount,
          successCount: job.successCount,
          failedCount: job.failedCount,
          pendingCount: job.pendingCount,
          batchRequestType: job.batchRequestType,
          lastSyncMessage: job.lastSyncMessage,
          updatedAt: job.updatedAt.toISOString()
        }
      : null,
    products: mappings.map((m) => ({
      productId: m.product.id,
      productName: m.product.name,
      mappingId: m.id,
      publishStatus: m.publishStatus,
      barcode: m.barcode,
      stockCode: m.stockCode,
      lastErrorMessage: m.lastErrorMessage
    }))
  });
}
