/**
 * Hepsiburada sipariş senkronu — OMS API'den paket listesi çeker, DB'ye yazar.
 *
 * Endpoint: GET /packages/merchantid/{merchantId}/packages
 * Parametreler: offset, limit, status, startDate, endDate
 * Maksimum limit: 100 (dokümantasyon), güvenli default: 50
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hbFetch, getHbMerchantId } from "@/lib/hepsiburadaFetch";
import {
  upsertHbPackageForStore,
  HB_INGEST_SOURCE,
  type HbIngestSource,
} from "@/lib/hepsiburadaOrderIngest";
import { asRecord } from "@/lib/hepsiburadaOrderNormalize";

// ─── Tip tanımları ───────────────────────────────────────────────────────────

export type HbOrderSyncParams = {
  userId: string;
  storeId: string;
  membershipId: string | null;
  status?: string;
  startDateMs?: number;
  endDateMs?: number;
  ingestSource?: HbIngestSource;
  continueOnError?: boolean;
};

export type HbOrderSyncResult = {
  fetched: number;
  created: number;
  updated: number;
  failed: number;
};

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

type HbPackagesResponse = {
  totalCount?: number;
  packageList?: unknown[];
  data?: unknown[];
  packages?: unknown[];
  content?: unknown[];
};

function extractPackages(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const r = data as HbPackagesResponse | null;
  if (!r) return [];
  return (
    r.packageList ??
    r.data ??
    r.packages ??
    r.content ??
    []
  );
}

function toIsoDateParam(ms: number): string {
  return new Date(ms).toISOString();
}

// ─── Tek sayfa çekme ─────────────────────────────────────────────────────────

export async function fetchHbPackagesPage(params: {
  storeId: string;
  merchantId: string;
  offset: number;
  limit: number;
  status?: string;
  startDateMs?: number;
  endDateMs?: number;
}): Promise<{ packages: unknown[]; totalCount: number }> {
  const qs = new URLSearchParams({
    offset: String(params.offset),
    limit: String(params.limit),
  });
  if (params.status) qs.set("status", params.status);
  if (params.startDateMs) qs.set("startDate", toIsoDateParam(params.startDateMs));
  if (params.endDateMs) qs.set("endDate", toIsoDateParam(params.endDateMs));

  const path = `/packages/merchantid/${encodeURIComponent(params.merchantId)}/packages?${qs.toString()}`;

  const res = await hbFetch<HbPackagesResponse>(params.storeId, "OMS", path);
  if (!res.ok) {
    throw new Error(`Hepsiburada paket listesi alınamadı: ${res.message}`);
  }

  const packages = extractPackages(res.data);
  const total =
    typeof (res.data as HbPackagesResponse).totalCount === "number"
      ? (res.data as HbPackagesResponse).totalCount!
      : packages.length;

  return { packages, totalCount: total };
}

// ─── Ana senkron fonksiyonu ──────────────────────────────────────────────────

const PAGE_SIZE = 50;
const MAX_PAGES = 200; // sonsuz döngü koruması

export async function syncHbOrdersForStore(
  params: HbOrderSyncParams
): Promise<HbOrderSyncResult> {
  const {
    storeId,
    userId,
    membershipId,
    status,
    startDateMs,
    endDateMs,
    ingestSource = HB_INGEST_SOURCE.MANUAL_SYNC,
    continueOnError = true,
  } = params;

  const result: HbOrderSyncResult = {
    fetched: 0,
    created: 0,
    updated: 0,
    failed: 0,
  };

  const merchantId = await getHbMerchantId(storeId);

  let offset = 0;
  let page = 0;
  let totalCount = Infinity;

  while (offset < totalCount && page < MAX_PAGES) {
    const { packages, totalCount: total } = await fetchHbPackagesPage({
      storeId,
      merchantId,
      offset,
      limit: PAGE_SIZE,
      status,
      startDateMs,
      endDateMs,
    });

    totalCount = total;

    if (packages.length === 0) break;

    for (const item of packages) {
      result.fetched += 1;
      const raw = asRecord(item);
      if (!raw) {
        result.failed += 1;
        continue;
      }

      try {
        const r = await upsertHbPackageForStore({
          storeId,
          raw,
          ingestSource,
          activityContext: { userId, membershipId },
        });
        if (r.wasNew) result.created += 1;
        else result.updated += 1;
      } catch (err) {
        result.failed += 1;
        if (!continueOnError) throw err;
      }
    }

    offset += packages.length;
    page += 1;

    if (packages.length < PAGE_SIZE) break;
  }

  // Senkron durumunu güncelle
  await prisma.storeOrderSyncState.upsert({
    where: { storeId_platform: { storeId, platform: "hepsiburada" } },
    create: {
      storeId,
      platform: "hepsiburada",
      lastSuccessfulSyncAt: new Date(),
      lastAttemptedSyncAt: new Date(),
      lastStatus: "completed",
    },
    update: {
      lastSuccessfulSyncAt: new Date(),
      lastAttemptedSyncAt: new Date(),
      lastStatus: "completed",
      lastErrorMessage: null,
    },
  });

  return result;
}

// ─── Job tabanlı senkron (OrderSyncJob tablosu üzerinden) ────────────────────

export async function enqueueHbOrderSyncJob(params: {
  storeId: string;
  triggeredByUserId: string | null;
  membershipId?: string | null;
  options?: {
    status?: string;
    startDateMs?: number;
    endDateMs?: number;
  };
}): Promise<{ jobId: string }> {
  const job = await prisma.orderSyncJob.create({
    data: {
      storeId: params.storeId,
      platform: "hepsiburada",
      syncType: "manual",
      status: "queued",
      triggeredByUserId: params.triggeredByUserId ?? undefined,
      options: (params.options ?? {}) as unknown as Prisma.InputJsonValue,
    },
  });
  return { jobId: job.id };
}

/**
 * Kuyruktaki Hepsiburada sipariş sync job'ını işler.
 * API route'larından çağrılır; job durumunu günceller.
 */
export async function processHbOrderSyncJob(params: {
  jobId: string;
  userId: string;
  storeId: string;
  membershipId: string | null;
}): Promise<HbOrderSyncResult> {
  const { jobId, userId, storeId, membershipId } = params;

  await prisma.orderSyncJob.update({
    where: { id: jobId },
    data: { status: "running", startedAt: new Date(), heartbeatAt: new Date() },
  });

  let result: HbOrderSyncResult = { fetched: 0, created: 0, updated: 0, failed: 0 };

  try {
    const job = await prisma.orderSyncJob.findUnique({ where: { id: jobId } });
    const opts = (job?.options ?? {}) as {
      status?: string;
      startDateMs?: number;
      endDateMs?: number;
    };

    const defaultStartMs = Date.now() - 30 * 86_400_000; // son 30 gün

    result = await syncHbOrdersForStore({
      userId,
      storeId,
      membershipId,
      status: opts.status,
      startDateMs: opts.startDateMs ?? defaultStartMs,
      endDateMs: opts.endDateMs ?? Date.now(),
      ingestSource: HB_INGEST_SOURCE.MANUAL_SYNC,
      continueOnError: true,
    });

    await prisma.orderSyncJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        finishedAt: new Date(),
        packagesFetchedCount: result.fetched,
        packagesCreatedCount: result.created,
        packagesUpdatedCount: result.updated,
        failedCount: result.failed,
      },
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Bilinmeyen hata.";
    await prisma.orderSyncJob.update({
      where: { id: jobId },
      data: { status: "failed", finishedAt: new Date(), errorMessage },
    });
    throw err;
  }

  return result;
}
