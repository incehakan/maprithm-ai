import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { enqueueOrderSyncJob } from "@/lib/trendyolOrderBackgroundSync";
import { triggerOrderSyncProcessing } from "@/lib/trendyolOrderSyncTrigger";

type Body = {
  status?: unknown;
  orderByField?: unknown;
  orderByDirection?: unknown;
  full?: unknown;
};

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
    where: {
      storeId_platform: { storeId: ctx.storeId, platform: "trendyol" }
    }
  });

  const jobs = await prisma.orderSyncJob.findMany({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      ...(jobId ? { id: jobId } : {})
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
      attemptCount: true,
      createdAt: true
    }
  });

  const running = await prisma.orderSyncJob.findFirst({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      status: "running"
    },
    select: { id: true, syncType: true, startedAt: true }
  });

  const latestFailed = await prisma.orderSyncJob.findFirst({
    where: {
      storeId: ctx.storeId,
      platform: "trendyol",
      status: "failed"
    },
    orderBy: { finishedAt: "desc" },
    select: { id: true, finishedAt: true, errorMessage: true }
  });

  return NextResponse.json({
    success: true,
    state,
    jobs,
    running,
    latestFailed
  });
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

  const url = new URL(request.url);
  const statusFromQuery = url.searchParams.get("status");

  const body = (await request.json().catch(() => null)) as Body | null;
  const statusFromBody =
    typeof body?.status === "string" ? body.status.trim() : "";
  const status = (statusFromQuery?.trim() || statusFromBody || undefined) as
    | string
    | undefined;
  const orderByField =
    typeof body?.orderByField === "string" ? body.orderByField.trim() : undefined;
  const orderByDirection =
    body?.orderByDirection === "ASC" || body?.orderByDirection === "DESC"
      ? body.orderByDirection
      : undefined;
  const fullSync = body?.full === true;

  try {
    const { job } = await enqueueOrderSyncJob({
      storeId: ctx.storeId,
      syncType: "manual",
      triggeredByUserId: ctx.userId,
      membershipId: ctx.membershipId,
      options: {
        status,
        orderByField,
        orderByDirection,
        pullKind: fullSync ? "full" : "incremental"
      }
    });

    await triggerOrderSyncProcessing(request.url);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      message: "Senkron kuyruğa alındı. Birkaç saniye içinde işlenecek."
    });
  } catch (err) {
    console.error("Trendyol order sync enqueue failed", err);
    const message =
      err instanceof Error ? err.message : "Senkron kuyruğa alınamadı.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
