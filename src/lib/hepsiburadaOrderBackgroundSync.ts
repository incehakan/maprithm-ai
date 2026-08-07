/**
 * Hepsiburada sipariş senkronu — cron / arka plan tetikleyici.
 *
 * Trendyol'daki trendyolOrderBackgroundSync.ts ile aynı işi görür ama daha
 * sade: HB tarafında zaten OrderSyncJob + enqueueHbOrderSyncJob/processHbOrderSyncJob
 * var (hepsiburadaOrderSync.ts). Bu dosya sadece:
 *   1) Aktif HB bağlantısı olan her mağaza için periyodik "incremental" job kuyruğa alır
 *   2) Kuyruktaki HB job'larını işler
 *   3) Aynı mağazada eşzamanlı iki koşuyu PG advisory lock ile engeller
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  enqueueHbOrderSyncJob,
  processHbOrderSyncJob
} from "@/lib/hepsiburadaOrderSync";
import { logger } from "@/lib/logger";

const CRON_MIN_INTERVAL_MS = 5 * 60 * 1000;
const RUNNING_JOB_MAX_MS = 25 * 60 * 1000;
const SYNC_RANGE_DAYS = 30;
const MS_DAY = 86_400_000;

function hashAdvisoryKeys(storeId: string): [number, number] {
  // Trendyol ile aynı anahtar alanını paylaşmamak için ayrı bir tuz kullanılır.
  const buf = createHash("sha256").update(`hb-order-sync:${storeId}`).digest();
  return [buf.readInt32BE(0), buf.readInt32BE(4)];
}

async function tryRunWithHbStoreOrderSyncLock<T>(
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

async function getHbSyncActorForStore(storeId: string): Promise<{
  userId: string;
  membershipId: string | null;
} | null> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "hepsiburada", isActive: true },
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

/**
 * Kuyruktaki (status="queued") HB sipariş job'larını sırasıyla işler.
 * Aynı mağaza için eşzamanlı çalışmayı advisory lock ile engeller.
 */
export async function processHbOrderSyncQueue(opts?: {
  maxJobs?: number;
}): Promise<{ processed: number; skippedLocked: number }> {
  // Takılı kalmış (running) job'ları failed'e çevir.
  const stuckThreshold = new Date(Date.now() - RUNNING_JOB_MAX_MS);
  await prisma.orderSyncJob.updateMany({
    where: {
      platform: "hepsiburada",
      status: "running",
      OR: [
        { heartbeatAt: { lte: stuckThreshold } },
        { startedAt: { lte: stuckThreshold } }
      ]
    },
    data: {
      status: "failed",
      finishedAt: new Date(),
      errorMessage: "Running timeout exceeded; marked as failed."
    }
  });

  const take = opts?.maxJobs ?? 12;
  const jobs = await prisma.orderSyncJob.findMany({
    where: { platform: "hepsiburada", status: "queued" },
    orderBy: { createdAt: "asc" },
    take,
    select: { id: true, storeId: true, triggeredByUserId: true }
  });

  let processed = 0;
  let skippedLocked = 0;

  for (const job of jobs) {
    const actor = await getHbSyncActorForStore(job.storeId);
    if (!actor) {
      await prisma.orderSyncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: "Aktif Hepsiburada bağlantısı yok."
        }
      });
      continue;
    }

    const lock = await tryRunWithHbStoreOrderSyncLock(job.storeId, async () => {
      await processHbOrderSyncJob({
        jobId: job.id,
        userId: job.triggeredByUserId ?? actor.userId,
        storeId: job.storeId,
        membershipId: actor.membershipId
      });
    });

    if (!lock.ok) {
      skippedLocked += 1;
      continue;
    }
    processed += 1;
  }

  return { processed, skippedLocked };
}

/**
 * Cron: aktif HB bağlantısı olan her mağaza için gerekiyorsa yeni bir
 * incremental sync job kuyruğa alır, ardından kuyruğu işler.
 */
export async function tickHbOrderBackgroundCron(): Promise<{
  enqueuedCronJobs: number;
  processed: number;
  skippedLocked: number;
}> {
  const stores = await prisma.marketplaceConnection.findMany({
    where: {
      platform: "hepsiburada",
      isActive: true,
      store: { status: "active" }
    },
    select: { storeId: true },
    distinct: ["storeId"]
  });

  let enqueuedCronJobs = 0;
  for (const { storeId } of stores) {
    const state = await prisma.storeOrderSyncState.findUnique({
      where: { storeId_platform: { storeId, platform: "hepsiburada" } }
    });
    const lastOk = state?.lastSuccessfulSyncAt?.getTime() ?? 0;
    if (Date.now() - lastOk < CRON_MIN_INTERVAL_MS) continue;

    const inflight = await prisma.orderSyncJob.findFirst({
      where: {
        storeId,
        platform: "hepsiburada",
        status: { in: ["queued", "running"] }
      }
    });
    if (inflight) continue;

    const defaultStartMs = Date.now() - SYNC_RANGE_DAYS * MS_DAY;

    try {
      await enqueueHbOrderSyncJob({
        storeId,
        triggeredByUserId: null,
        options: {
          startDateMs: defaultStartMs,
          endDateMs: Date.now()
        }
      });
      enqueuedCronJobs += 1;
    } catch (e) {
      logger.error("hb_order_sync_enqueue_failed", {
        job: "hb_order_sync_cron",
        storeId,
        error: e instanceof Error ? e.message : String(e)
      });
    }
  }

  const { processed, skippedLocked } = await processHbOrderSyncQueue({ maxJobs: 15 });

  return { enqueuedCronJobs, processed, skippedLocked };
}
