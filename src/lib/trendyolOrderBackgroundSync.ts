import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { TRENDYOL_ORDER_INGEST_SOURCE } from "@/lib/trendyolOrderIngestFromPackage";
import { reconcileRecentOrdersForStore } from "@/lib/orderReconciliation";
import {
  runTrendyolOrderSyncPull,
  type OrderSyncPullMode
} from "@/lib/trendyolOrderSync";

const MS_DAY = 86_400_000;
const SYNC_RANGE_DAYS = 30;
const SYNC_OVERLAP_MS = 15 * 60 * 1000;
const CRON_MIN_INTERVAL_MS = 5 * 60 * 1000;

export type OrderSyncJobOptions = {
  status?: string;
  orderByField?: string;
  orderByDirection?: "ASC" | "DESC";
  pullKind?: "incremental" | "full" | "reconcile";
};

export async function getTrendyolSyncActorForStore(storeId: string): Promise<{
  userId: string;
  membershipId: string | null;
} | null> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { userId: true }
  });
  if (!conn?.userId) return null;
  const membership = await prisma.storeMembership.findFirst({
    where: { userId: conn.userId, storeId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  return { userId: conn.userId, membershipId: membership?.id ?? null };
}

function hashAdvisoryKeys(storeId: string): [number, number] {
  const buf = createHash("sha256").update(`order-sync:${storeId}`).digest();
  return [buf.readInt32BE(0), buf.readInt32BE(4)];
}

/**
 * Aynı mağazada eşzamanlı iki sync koşmasını PG advisory lock ile engeller.
 */
export async function tryRunWithStoreOrderSyncLock<T>(
  storeId: string,
  fn: () => Promise<T>
): Promise<{ ok: true; result: T } | { ok: false; reason: "locked" }> {
  const [k1, k2] = hashAdvisoryKeys(storeId);
  const rows = await prisma.$queryRaw<{ pg_try_advisory_lock: boolean }[]>`
    SELECT pg_try_advisory_lock(${k1}::integer, ${k2}::integer) AS "pg_try_advisory_lock"
  `;
  if (rows[0]?.pg_try_advisory_lock !== true) {
    return { ok: false, reason: "locked" };
  }
  try {
    const result = await fn();
    return { ok: true, result };
  } finally {
    await prisma.$queryRaw`
      SELECT pg_advisory_unlock(${k1}::integer, ${k2}::integer)
    `;
  }
}

function isRetryableError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("fetch") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket")
  );
}

function backoffMs(attemptZeroBased: number): number {
  return Math.min(120_000, 4000 * Math.pow(2, attemptZeroBased));
}

function parseJobOptions(raw: Prisma.JsonValue | null | undefined): OrderSyncJobOptions {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as OrderSyncJobOptions;
}

async function logJob(
  userId: string | null | undefined,
  storeId: string,
  membershipId: string | null | undefined,
  action: string,
  message: string,
  entityId?: string
) {
  if (!userId) return;
  await createActivityLog({
    userId,
    storeId,
    membershipId: membershipId ?? undefined,
    action,
    entityType: "order_sync_job",
    entityId: entityId ?? undefined,
    message
  });
}

export async function enqueueOrderSyncJob(params: {
  storeId: string;
  platform?: string;
  syncType: string;
  triggeredByUserId?: string | null;
  membershipId?: string | null;
  options?: OrderSyncJobOptions;
}): Promise<{ job: { id: string } }> {
  const platform = params.platform ?? "trendyol";

  const job = await prisma.orderSyncJob.create({
    data: {
      storeId: params.storeId,
      platform,
      syncType: params.syncType,
      status: "queued",
      options: params.options
        ? (params.options as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      triggeredByUserId: params.triggeredByUserId ?? undefined
    },
    select: { id: true }
  });

  const actor = await getTrendyolSyncActorForStore(params.storeId);
  await logJob(
    params.triggeredByUserId ?? actor?.userId,
    params.storeId,
    params.membershipId ?? actor?.membershipId ?? undefined,
    "TRENDYOL_ORDER_SYNC_JOB_QUEUED",
    `Sipariş senkron kuyruğa alındı (${params.syncType}).`,
    job.id
  );

  return { job };
}

async function finalizeJobState(params: {
  storeId: string;
  platform: string;
  jobId: string;
  status: "completed" | "failed" | "partial";
  errorMessage?: string | null;
  hadSuccess: boolean;
}) {
  await prisma.storeOrderSyncState.upsert({
    where: {
      storeId_platform: { storeId: params.storeId, platform: params.platform }
    },
    create: {
      storeId: params.storeId,
      platform: params.platform,
      lastAttemptedSyncAt: new Date(),
      lastSuccessfulSyncAt: params.hadSuccess ? new Date() : null,
      lastStatus: params.status,
      lastErrorMessage: params.errorMessage ?? null,
      lastJobId: params.jobId
    },
    update: {
      lastAttemptedSyncAt: new Date(),
      ...(params.hadSuccess ? { lastSuccessfulSyncAt: new Date() } : {}),
      lastStatus: params.status,
      lastErrorMessage: params.errorMessage ?? null,
      lastJobId: params.jobId
    }
  });
}

export async function runOrderSyncJob(jobId: string): Promise<void> {
  const job = await prisma.orderSyncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "queued") return;

  const claim = await prisma.orderSyncJob.updateMany({
    where: { id: jobId, status: "queued" },
    data: { status: "running", startedAt: new Date() }
  });
  if (claim.count === 0) return;

  const actor = await getTrendyolSyncActorForStore(job.storeId);
  if (!actor) {
    await prisma.orderSyncJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: "Aktif Trendyol bağlantısı yok."
      }
    });
    await finalizeJobState({
      storeId: job.storeId,
      platform: job.platform,
      jobId,
      status: "failed",
      errorMessage: "Bağlantı yok",
      hadSuccess: false
    });
    return;
  }

  const userId = job.triggeredByUserId ?? actor.userId;
  const membershipId = actor.membershipId;
  const options = parseJobOptions(job.options);

  const lock = await tryRunWithStoreOrderSyncLock(job.storeId, async () => {
    const jobRow = await prisma.orderSyncJob.findUnique({ where: { id: jobId } });
    if (!jobRow) return;

    try {
    await logJob(
      userId,
      job.storeId,
      membershipId,
      "TRENDYOL_ORDER_SYNC_JOB_STARTED",
      `Senkron işi başladı (${job.syncType}).`,
      jobId
    );

    const now = Date.now();
    let pullResult: Awaited<ReturnType<typeof runTrendyolOrderSyncPull>> | null = null;
    let reconcileResult: Awaited<ReturnType<typeof reconcileRecentOrdersForStore>> | null =
      null;

    const ingestSource =
      job.syncType === "cron"
        ? TRENDYOL_ORDER_INGEST_SOURCE.CRON_SYNC
        : job.syncType === "retry"
          ? TRENDYOL_ORDER_INGEST_SOURCE.CRON_SYNC
          : job.syncType === "webhook_reconcile"
            ? TRENDYOL_ORDER_INGEST_SOURCE.RECONCILE
            : TRENDYOL_ORDER_INGEST_SOURCE.MANUAL_SYNC;

    const activityCtx = { userId, membershipId };

    if (job.syncType === "webhook_reconcile" || options.pullKind === "reconcile") {
      reconcileResult = await reconcileRecentOrdersForStore(job.storeId);
      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId: job.storeId,
          orderId: null,
          action: "ORDER_SYNCED",
          message: `Uzlaştırma: ${reconcileResult.updated} paket güncellendi, ${reconcileResult.failed} başarısız (${reconcileResult.checked} kontrol).`
        }
      });
      await logJob(
        userId,
        job.storeId,
        membershipId,
        "TRENDYOL_ORDER_RECONCILIATION_COMPLETED",
        `Uzlaştırma turu bitti (güncellenen ${reconcileResult.updated}).`,
        jobId
      );
    } else {
      const state = await prisma.storeOrderSyncState.findUnique({
        where: {
          storeId_platform: { storeId: job.storeId, platform: job.platform }
        }
      });

      let mode: OrderSyncPullMode;
      let rangeStartMs: number;
      let rangeEndMs = now;

      if (options.pullKind === "full") {
        mode = "full_order_date_windows";
        rangeStartMs = now - SYNC_RANGE_DAYS * MS_DAY;
      } else {
        mode = "incremental_last_modified";
        const base =
          state?.lastSuccessfulSyncAt?.getTime() ?? now - SYNC_RANGE_DAYS * MS_DAY;
        rangeStartMs = Math.max(now - SYNC_RANGE_DAYS * MS_DAY, base - SYNC_OVERLAP_MS);
      }

      await prisma.orderSyncJob.update({
        where: { id: jobId },
        data: {
          lastCursorStartDate: new Date(rangeStartMs),
          lastCursorEndDate: new Date(rangeEndMs)
        }
      });

      pullResult = await runTrendyolOrderSyncPull({
        userId: actor.userId,
        storeId: job.storeId,
        membershipId,
        status: options.status,
        orderByField: options.orderByField,
        orderByDirection: options.orderByDirection,
        ingestSource,
        activityContext: activityCtx,
        mode,
        rangeStartMs,
        rangeEndMs,
        continueOnPackageError: true
      });

      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId: job.storeId,
          orderId: null,
          action: "ORDER_SYNCED",
          message: `${job.syncType} job bitti: çekilen ${pullResult.fetched}, yeni ${pullResult.created}, güncel ${pullResult.updated}, atlanan ${pullResult.skipped}, hata ${pullResult.failed}.`
        }
      });
    }

    let packagesFetchedCount = 0;
    let packagesCreatedCount = 0;
    let packagesUpdatedCount = 0;
    let packagesSkippedCount = 0;
    let failedCount = 0;

    if (reconcileResult) {
      packagesFetchedCount = reconcileResult.checked;
      packagesUpdatedCount = reconcileResult.updated;
      failedCount = reconcileResult.failed;
      packagesSkippedCount = Math.max(
        0,
        reconcileResult.checked - reconcileResult.updated - reconcileResult.failed
      );
    } else if (pullResult) {
      packagesFetchedCount = pullResult.fetched;
      packagesCreatedCount = pullResult.created;
      packagesUpdatedCount = pullResult.updated;
      packagesSkippedCount = pullResult.skipped;
      failedCount = pullResult.failed;
    }

    let finalStatus: "completed" | "failed" | "partial" = "completed";
    const wroteSomething = packagesCreatedCount + packagesUpdatedCount > 0;
    if (failedCount > 0) {
      if (!wroteSomething && packagesFetchedCount <= failedCount) finalStatus = "failed";
      else finalStatus = "partial";
    }

    await prisma.orderSyncJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
        packagesFetchedCount,
        packagesCreatedCount,
        packagesUpdatedCount,
        packagesSkippedCount,
        failedCount,
        errorMessage:
          finalStatus === "failed"
            ? "İşlenecek kayıt yok veya tümü başarısız."
            : failedCount
              ? `${failedCount} kayıt işlenemedi.`
              : null
      }
    });

    const hadSuccess = finalStatus !== "failed";

    await finalizeJobState({
      storeId: job.storeId,
      platform: job.platform,
      jobId,
      status: finalStatus,
      errorMessage: finalStatus === "failed" ? "Senkron başarısız" : null,
      hadSuccess
    });

    await logJob(
      userId,
      job.storeId,
      membershipId,
      finalStatus === "failed"
        ? "TRENDYOL_ORDER_SYNC_JOB_FAILED"
        : "TRENDYOL_ORDER_SYNC_JOB_COMPLETED",
      finalStatus === "failed"
        ? `Senkron başarısız (${failedCount} hata).`
        : finalStatus === "partial"
          ? `Senkron kısmen tamam (çekilen ${packagesFetchedCount}, hata ${failedCount}).`
          : `Senkron tamamlandı (çekilen ${packagesFetchedCount}).`,
      jobId
    );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isRetryableError(e) && jobRow.attemptCount < jobRow.maxAttempts) {
        await prisma.orderSyncJob.update({
          where: { id: jobId },
          data: {
            status: "queued",
            startedAt: null,
            finishedAt: null,
            attemptCount: { increment: 1 },
            nextRetryAt: new Date(Date.now() + backoffMs(jobRow.attemptCount)),
            errorMessage: msg
          }
        });
        await logJob(
          userId,
          job.storeId,
          membershipId,
          "TRENDYOL_ORDER_SYNC_RETRIED",
          `Geçici hata; yeniden kuyrukta (${jobRow.attemptCount + 1}/${jobRow.maxAttempts}): ${msg}`,
          jobId
        );
        return;
      }
      await prisma.orderSyncJob.update({
        where: { id: jobId },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: msg
        }
      });
      await finalizeJobState({
        storeId: job.storeId,
        platform: job.platform,
        jobId,
        status: "failed",
        errorMessage: msg,
        hadSuccess: false
      });
      await logJob(
        userId,
        job.storeId,
        membershipId,
        "TRENDYOL_ORDER_SYNC_JOB_FAILED",
        msg,
        jobId
      );
    }

    return;
  });

  if (!lock.ok) {
    await prisma.orderSyncJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        startedAt: null,
        nextRetryAt: new Date(Date.now() + 10_000)
      }
    });
    return;
  }
}

export async function runIncrementalOrderSync(params: {
  storeId: string;
  userId: string;
  membershipId: string | null;
  status?: string;
}): Promise<ReturnType<typeof runTrendyolOrderSyncPull>> {
  const state = await prisma.storeOrderSyncState.findUnique({
    where: { storeId_platform: { storeId: params.storeId, platform: "trendyol" } }
  });
  const now = Date.now();
  const base = state?.lastSuccessfulSyncAt?.getTime() ?? now - SYNC_RANGE_DAYS * MS_DAY;
  const rangeStartMs = Math.max(now - SYNC_RANGE_DAYS * MS_DAY, base - SYNC_OVERLAP_MS);
  return runTrendyolOrderSyncPull({
    userId: params.userId,
    storeId: params.storeId,
    membershipId: params.membershipId,
    status: params.status,
    ingestSource: TRENDYOL_ORDER_INGEST_SOURCE.CRON_SYNC,
    activityContext: { userId: params.userId, membershipId: params.membershipId },
    mode: "incremental_last_modified",
    rangeStartMs,
    rangeEndMs: now,
    continueOnPackageError: true
  });
}

export async function runReconciliationPass(storeId: string): Promise<void> {
  const actor = await getTrendyolSyncActorForStore(storeId);
  if (!actor) return;
  try {
    const r = await reconcileRecentOrdersForStore(storeId);
    await prisma.storeOrderSyncState.upsert({
      where: { storeId_platform: { storeId, platform: "trendyol" } },
      create: {
        storeId,
        platform: "trendyol",
        lastReconcileAt: new Date()
      },
      update: { lastReconcileAt: new Date() }
    });
    await logJob(
      actor.userId,
      storeId,
      actor.membershipId,
      "TRENDYOL_ORDER_RECONCILIATION_COMPLETED",
      `Hafif uzlaştırma: ${r.updated} güncellendi, ${r.failed} başarısız.`,
      undefined
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Uzlaştırma hatası";
    await logJob(
      actor.userId,
      storeId,
      actor.membershipId,
      "TRENDYOL_ORDER_RECONCILIATION_FAILED",
      msg,
      undefined
    );
    throw e;
  }
}

export async function processOrderSyncQueue(opts?: { maxJobs?: number }): Promise<void> {
  const take = opts?.maxJobs ?? 12;
  const jobs = await prisma.orderSyncJob.findMany({
    where: {
      status: "queued",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }]
    },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true }
  });

  for (const j of jobs) {
    await runOrderSyncJob(j.id);
  }
}

/**
 * Cron: kuyruktaki işleri çalıştırır, gerekirse periyodik incremental job üretir.
 */
export async function tickTrendyolOrderBackgroundCron(): Promise<{
  processedQueues: number;
  enqueuedCronJobs: number;
}> {
  await processOrderSyncQueue({ maxJobs: 15 });

  const stores = await prisma.marketplaceConnection.findMany({
    where: {
      platform: "trendyol",
      isActive: true,
      store: { status: "active" }
    },
    select: { storeId: true },
    distinct: ["storeId"]
  });

  let enqueuedCronJobs = 0;
  for (const { storeId } of stores) {
    const state = await prisma.storeOrderSyncState.findUnique({
      where: { storeId_platform: { storeId, platform: "trendyol" } }
    });
    const lastOk = state?.lastSuccessfulSyncAt?.getTime() ?? 0;
    if (Date.now() - lastOk < CRON_MIN_INTERVAL_MS) continue;

    const inflight = await prisma.orderSyncJob.findFirst({
      where: {
        storeId,
        platform: "trendyol",
        status: { in: ["queued", "running"] }
      }
    });
    if (inflight) continue;

    await enqueueOrderSyncJob({
      storeId,
      syncType: "cron",
      options: { pullKind: "incremental" }
    });
    enqueuedCronJobs += 1;
  }

  await processOrderSyncQueue({ maxJobs: 15 });

  return { processedQueues: 0, enqueuedCronJobs };
}
