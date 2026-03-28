import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  TRENDYOL_ORDER_INGEST_SOURCE,
  upsertTrendyolShipmentPackageForStore
} from "@/lib/trendyolOrderIngestFromPackage";
import { fetchTrendyolPackagesByOrderNumber } from "@/lib/trendyolOrderSync";
import { asRecord, normalizeShipmentPackageId } from "@/lib/trendyolOrderNormalize";

const MS_DAY = 86_400_000;

async function getActor(storeId: string) {
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

/**
 * Uzun süredir API’den yenilenmemiş paketleri listeler.
 */
export async function detectStalePackages(
  storeId: string,
  opts?: { maxAgeMinutes?: number; take?: number }
) {
  const maxAge = opts?.maxAgeMinutes ?? 180;
  const threshold = new Date(Date.now() - maxAge * 60 * 1000);
  return prisma.marketplaceOrder.findMany({
    where: {
      storeId,
      platform: "trendyol",
      OR: [{ lastFetchedAt: null }, { lastFetchedAt: { lt: threshold } }]
    },
    select: {
      id: true,
      shipmentPackageId: true,
      orderNumber: true,
      orderDate: true,
      packageStatus: true,
      lastFetchedAt: true
    },
    take: opts?.take ?? 40,
    orderBy: [{ lastFetchedAt: "asc" }, { updatedAt: "asc" }]
  });
}

/**
 * Tek paketi Trendyol API’den sipariş numarası üzerinden yeniden çekip upsert eder.
 */
export async function reconcilePackageByShipmentPackageId(
  storeId: string,
  shipmentPackageId: string
): Promise<{ ok: boolean; reason?: string }> {
  const order = await prisma.marketplaceOrder.findFirst({
    where: { storeId, platform: "trendyol", shipmentPackageId }
  });
  if (!order) return { ok: false, reason: "Paket bulunamadı" };

  const actor = await getActor(storeId);
  if (!actor) return { ok: false, reason: "Trendyol bağlantısı yok" };

  const startMs = order.orderDate.getTime() - 7 * MS_DAY;
  const endMs = Math.min(Date.now(), order.orderDate.getTime() + 14 * MS_DAY);

  let packages: unknown[];
  try {
    packages = await fetchTrendyolPackagesByOrderNumber({
      userId: actor.userId,
      storeId,
      orderNumber: order.orderNumber,
      startDateMs: startMs,
      endDateMs: endMs
    });
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "API hatası"
    };
  }

  const match = packages
    .map((p) => asRecord(p))
    .find((raw) => {
      if (!raw) return false;
      const id =
        normalizeShipmentPackageId(raw) ??
        (raw.shipmentPackageId != null ? String(raw.shipmentPackageId) : null) ??
        (raw.id != null ? String(raw.id) : null) ??
        "";
      return id === shipmentPackageId;
    });

  if (!match) {
    return { ok: false, reason: "API yanıtında paket yok" };
  }

  const prevStatus = order.packageStatus;
  const res = await upsertTrendyolShipmentPackageForStore(prisma, {
    storeId,
    raw: match,
    ingestSource: TRENDYOL_ORDER_INGEST_SOURCE.RECONCILE,
    activityContext: { userId: actor.userId, membershipId: actor.membershipId }
  });

  const row = await prisma.marketplaceOrder.findFirst({
    where: { id: res.orderId },
    select: { packageStatus: true }
  });
  if (row?.packageStatus !== prevStatus && prevStatus != null) {
    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: res.orderId,
        action: "PACKAGE_STATE_CORRECTED",
        message: `Uzlaştırma: statü ${prevStatus ?? "—"} → ${row?.packageStatus ?? "—"}`,
        previousStatus: prevStatus,
        nextStatus: row?.packageStatus ?? null,
        relatedShipmentPackageId: shipmentPackageId
      }
    });
  }

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: res.orderId,
      action: "PACKAGE_RECONCILED",
      message: `Paket API ile uzlaştırıldı: ${shipmentPackageId}`,
      relatedShipmentPackageId: shipmentPackageId,
      rawData: { ingest: "reconcile" } as Prisma.InputJsonValue
    }
  });

  return { ok: true };
}

/**
 * Mağazadaki bayat paketler için sınırlı uzlaştırma turu.
 */
export async function reconcileRecentOrdersForStore(storeId: string): Promise<{
  checked: number;
  updated: number;
  failed: number;
}> {
  const stale = await detectStalePackages(storeId, { take: 35 });
  let updated = 0;
  let failed = 0;
  for (const s of stale) {
    const r = await reconcilePackageByShipmentPackageId(storeId, s.shipmentPackageId);
    if (r.ok) updated += 1;
    else failed += 1;
  }
  return { checked: stale.length, updated, failed };
}
