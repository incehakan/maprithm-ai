import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  enqueueHbOrderSyncJob,
  processHbOrderSyncJob,
} from "@/lib/hepsiburadaOrderSync";

export async function GET(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "orders.view");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim() ?? "";

  const state = await prisma.storeOrderSyncState.findUnique({
    where: { storeId_platform: { storeId: ctx.storeId, platform: "hepsiburada" } },
  });

  const jobs = await prisma.orderSyncJob.findMany({
    where: {
      storeId: ctx.storeId,
      platform: "hepsiburada",
      ...(jobId ? { id: jobId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: jobId ? 1 : 10,
    select: {
      id: true,
      syncType: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      packagesFetchedCount: true,
      packagesCreatedCount: true,
      packagesUpdatedCount: true,
      failedCount: true,
      errorMessage: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ success: true, state, jobs });
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "orders.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    status?: string;
    startDateMs?: number;
    endDateMs?: number;
  } | null;

  try {
    const { jobId } = await enqueueHbOrderSyncJob({
      storeId: ctx.storeId,
      triggeredByUserId: ctx.userId,
      membershipId: ctx.membershipId,
      options: {
        status: body?.status,
        startDateMs: body?.startDateMs,
        endDateMs: body?.endDateMs,
      },
    });

    // Senkron çalıştır (küçük hesaplar için yeterli; büyük mağazada arka plana taşı)
    processHbOrderSyncJob({
      jobId,
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
    }).catch(() => {/* log zaten job tablosuna yazılıyor */});

    return NextResponse.json({
      success: true,
      jobId,
      message: "Hepsiburada sipariş senkronu başlatıldı.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Senkron başlatılamadı.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
