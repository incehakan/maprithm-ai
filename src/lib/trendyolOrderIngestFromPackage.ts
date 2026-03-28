import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import {
  detectPackageLifecycleChange,
  detectSplitPackage,
  type ExistingPackageForSplit,
  type LineRefForSplit
} from "@/lib/orderLifecycle";
import {
  normalizeTrackingData,
  trackingEventsFingerprint,
  trackingOrderFieldsFingerprint
} from "@/lib/trendyolTracking";
import {
  asRecord,
  extractInvoiceShipment,
  extractLinesArray,
  normalizeCurrency,
  normalizeCustomerId,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  normalizeDeliveryAddressType,
  normalizeLineBarcode,
  normalizeLineCommission,
  normalizeLineId,
  normalizeLineProductName,
  normalizeLineQuantity,
  normalizeLineStatus,
  normalizeLineStockCode,
  normalizeLineUnitPrice,
  normalizeLineVatBase,
  normalizeOrderDateMs,
  normalizeOrderNumber,
  normalizePackageStatus,
  normalizeShipmentPackageId,
  normalizeTotalPrice
} from "@/lib/trendyolOrderNormalize";

export const TRENDYOL_ORDER_INGEST_SOURCE = {
  MANUAL_SYNC: "manual_sync",
  WEBHOOK: "webhook",
  OPERATION: "operation",
  SPLIT: "split",
  CRON_SYNC: "cron_sync",
  RECONCILE: "reconcile"
} as const;

export type TrendyolOrderIngestSource =
  (typeof TRENDYOL_ORDER_INGEST_SOURCE)[keyof typeof TRENDYOL_ORDER_INGEST_SOURCE];

type DbLike = {
  marketplaceOrder: {
    upsert: typeof prisma.marketplaceOrder.upsert;
    findUnique: typeof prisma.marketplaceOrder.findUnique;
    findMany: typeof prisma.marketplaceOrder.findMany;
  };
  marketplaceOrderLine: {
    deleteMany: typeof prisma.marketplaceOrderLine.deleteMany;
    createMany: typeof prisma.marketplaceOrderLine.createMany;
  };
  marketplaceOrderEvent: {
    create: typeof prisma.marketplaceOrderEvent.create;
  };
  marketplaceOrderTrackingEvent: {
    findMany: typeof prisma.marketplaceOrderTrackingEvent.findMany;
    deleteMany: typeof prisma.marketplaceOrderTrackingEvent.deleteMany;
    createMany: typeof prisma.marketplaceOrderTrackingEvent.createMany;
  };
};

export function packageToStableShipmentId(
  raw: Record<string, unknown>,
  orderNumberFallback: string
): string {
  const pid = normalizeShipmentPackageId(raw);
  if (pid) return pid;
  const oid = raw.orderNumber ?? raw.id;
  return `fallback-${orderNumberFallback}-${oid ?? randomUUID()}`;
}

function buildLineRefsFromRaw(raw: Record<string, unknown>): LineRefForSplit[] {
  const lines = extractLinesArray(raw);
  const refs: LineRefForSplit[] = [];
  let idx = 0;
  for (const lineItem of lines) {
    const line = asRecord(lineItem);
    if (!line) continue;
    idx += 1;
    refs.push({
      lineId: normalizeLineId(line),
      barcode: normalizeLineBarcode(line),
      stockCode: normalizeLineStockCode(line),
      quantity: normalizeLineQuantity(line)
    });
  }
  return refs;
}

async function logIngestActivity(
  ctx: { userId: string; storeId: string; membershipId?: string | null } | undefined,
  action: string,
  message: string,
  entityId?: string
) {
  if (!ctx?.userId) return;
  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId ?? undefined,
    action,
    entityType: "marketplace_order",
    entityId: entityId ?? undefined,
    message
  });
}

/**
 * Tek Trendyol paket gövdesini store siparişi + satırlarına yazar.
 * Manuel API senkronu ve webhook aynı yolu kullanır (idempotent upsert).
 */
export async function upsertTrendyolShipmentPackageForStore(
  db: DbLike,
  params: {
    storeId: string;
    raw: Record<string, unknown>;
    ingestSource: TrendyolOrderIngestSource;
    activityContext?: { userId: string; membershipId?: string | null };
  }
): Promise<{ orderId: string; shipmentPackageId: string; wasNew: boolean }> {
  const { storeId, raw, ingestSource, activityContext } = params;

  const orderNumber = normalizeOrderNumber(raw);
  const pkgId = packageToStableShipmentId(raw, orderNumber);
  const orderMs = normalizeOrderDateMs(raw);
  const orderDate = orderMs != null ? new Date(orderMs) : new Date();
  const newStatus = normalizePackageStatus(raw);
  const tn = normalizeTrackingData(raw);
  const incomingLineRefs = buildLineRefsFromRaw(raw);

  const [invoiceJson, shipmentJson] = extractInvoiceShipment(raw);
  const shipRec = asRecord(shipmentJson as unknown);
  const invRec = asRecord(invoiceJson as unknown);
  const custFirst =
    (raw.customerFirstName as string | undefined) ??
    (shipRec?.firstName as string | undefined)?.toString() ??
    null;
  const custLast =
    (raw.customerLastName as string | undefined) ??
    (shipRec?.lastName as string | undefined)?.toString() ??
    null;

  const existing = await db.marketplaceOrder.findUnique({
    where: {
      storeId_platform_shipmentPackageId: {
        storeId,
        platform: "trendyol",
        shipmentPackageId: pkgId
      }
    },
    include: { lines: true }
  });

  let splitFromPackageId: string | null = null;
  let parentShipmentPackageId: string | null = null;
  let isSplitPackage = false;
  let splitDetectedAt: Date | null = null;
  let rootOrderNumber = existing?.rootOrderNumber ?? orderNumber;

  if (!existing) {
    const siblings = await db.marketplaceOrder.findMany({
      where: {
        storeId,
        platform: "trendyol",
        orderNumber,
        shipmentPackageId: { not: pkgId }
      },
      include: { lines: true }
    });

    const forSplit: ExistingPackageForSplit[] = siblings.map((s) => ({
      id: s.id,
      shipmentPackageId: s.shipmentPackageId,
      lines: s.lines.map((l) => ({
        lineId: l.lineId,
        stockCode: l.stockCode,
        barcode: l.barcode,
        quantity: l.quantity
      }))
    }));

    const splitHit = detectSplitPackage(forSplit, {
      shipmentPackageId: pkgId,
      lines: incomingLineRefs
    });

    if (splitHit) {
      const parentRow = await db.marketplaceOrder.findUnique({
        where: { id: splitHit.parentId },
        select: { rootOrderNumber: true, orderNumber: true }
      });
      splitFromPackageId = splitHit.parentId;
      parentShipmentPackageId = splitHit.parentShipmentPackageId;
      isSplitPackage = true;
      splitDetectedAt = new Date();
      rootOrderNumber = parentRow?.rootOrderNumber ?? parentRow?.orderNumber ?? orderNumber;
    } else {
      rootOrderNumber = orderNumber;
    }
  }

  const prevStatus = existing?.packageStatus ?? null;
  let packageStatusUpdatedAt = existing?.packageStatusUpdatedAt ?? null;
  if (!existing) {
    packageStatusUpdatedAt = new Date();
  } else if (prevStatus !== newStatus) {
    packageStatusUpdatedAt = new Date();
  }

  const lastIngestSource: TrendyolOrderIngestSource =
    !existing && isSplitPackage ? TRENDYOL_ORDER_INGEST_SOURCE.SPLIT : ingestSource;

  const orderRow = await db.marketplaceOrder.upsert({
    where: {
      storeId_platform_shipmentPackageId: {
        storeId,
        platform: "trendyol",
        shipmentPackageId: pkgId
      }
    },
    create: {
      storeId,
      platform: "trendyol",
      orderNumber,
      rootOrderNumber,
      orderDate,
      shipmentPackageId: pkgId,
      parentShipmentPackageId: parentShipmentPackageId ?? undefined,
      packageStatus: newStatus,
      packageStatusUpdatedAt: packageStatusUpdatedAt ?? undefined,
      cargoTrackingNumber: tn.cargoTrackingNumber,
      cargoTrackingLink: tn.cargoTrackingLink ?? undefined,
      cargoProviderName: tn.cargoProviderName,
      cargoProviderCode: tn.cargoProviderCode ?? undefined,
      cargoStatusText: tn.cargoStatusText ?? undefined,
      cargoLastEventAt: tn.cargoLastEventAt ?? undefined,
      cargoLastEventMessage: tn.cargoLastEventMessage ?? undefined,
      trackingRawData: tn.trackingRawData as unknown as Prisma.InputJsonValue,
      customerId: normalizeCustomerId(raw),
      deliveryAddressType: normalizeDeliveryAddressType(raw),
      customerFirstName: custFirst,
      customerLastName: custLast,
      customerEmailMasked: normalizeCustomerEmail(raw),
      customerPhoneMasked: normalizeCustomerPhone(raw, shipRec, invRec),
      totalPrice: normalizeTotalPrice(raw),
      currency: normalizeCurrency(raw),
      invoiceAddress: invoiceJson ?? undefined,
      shipmentAddress: shipmentJson ?? undefined,
      rawData: raw as unknown as Prisma.JsonObject,
      lastFetchedAt: new Date(),
      lastIngestSource,
      splitFromPackageId: splitFromPackageId ?? undefined,
      splitDetectedAt: splitDetectedAt ?? undefined,
      isSplitPackage
    },
    update: {
      orderNumber,
      orderDate,
      packageStatus: newStatus,
      packageStatusUpdatedAt: packageStatusUpdatedAt ?? undefined,
      cargoTrackingNumber: tn.cargoTrackingNumber,
      cargoTrackingLink: tn.cargoTrackingLink ?? undefined,
      cargoProviderName: tn.cargoProviderName,
      cargoProviderCode: tn.cargoProviderCode ?? undefined,
      cargoStatusText: tn.cargoStatusText ?? undefined,
      cargoLastEventAt: tn.cargoLastEventAt ?? undefined,
      cargoLastEventMessage: tn.cargoLastEventMessage ?? undefined,
      trackingRawData: tn.trackingRawData as unknown as Prisma.InputJsonValue,
      customerId: normalizeCustomerId(raw),
      deliveryAddressType: normalizeDeliveryAddressType(raw),
      customerFirstName: custFirst,
      customerLastName: custLast,
      customerEmailMasked: normalizeCustomerEmail(raw),
      customerPhoneMasked: normalizeCustomerPhone(raw, shipRec, invRec),
      totalPrice: normalizeTotalPrice(raw),
      currency: normalizeCurrency(raw),
      invoiceAddress: invoiceJson ?? undefined,
      shipmentAddress: shipmentJson ?? undefined,
      rawData: raw as unknown as Prisma.JsonObject,
      lastFetchedAt: new Date(),
      lastIngestSource: ingestSource
    }
  });

  await db.marketplaceOrderLine.deleteMany({
    where: { orderId: orderRow.id, storeId }
  });

  const lines = extractLinesArray(raw);
  const lineRows: Prisma.MarketplaceOrderLineCreateManyInput[] = [];
  let idx = 0;
  for (const lineItem of lines) {
    const line = asRecord(lineItem);
    if (!line) continue;
    idx += 1;
    lineRows.push({
      storeId,
      orderId: orderRow.id,
      lineId: normalizeLineId(line) ?? `idx-${idx}`,
      barcode: normalizeLineBarcode(line),
      stockCode: normalizeLineStockCode(line),
      productName: normalizeLineProductName(line),
      quantity: normalizeLineQuantity(line),
      lineUnitPrice: normalizeLineUnitPrice(line),
      vatBaseAmount: normalizeLineVatBase(line),
      commissionAmount: normalizeLineCommission(line),
      lineStatus: normalizeLineStatus(line),
      rawData: line as unknown as Prisma.JsonObject
    });
  }

  if (lineRows.length > 0) {
    await db.marketplaceOrderLine.createMany({ data: lineRows });
  }

  const actCtx =
    activityContext != null
      ? { userId: activityContext.userId, storeId, membershipId: activityContext.membershipId }
      : undefined;

  if (!existing) {
    await db.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "PACKAGE_CREATED",
        message: `Paket kaydı açıldı (${pkgId}).`,
        previousStatus: null,
        nextStatus: newStatus,
        relatedShipmentPackageId: pkgId,
        rawData: { orderNumber, rootOrderNumber } as Prisma.InputJsonValue
      }
    });

    await db.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "PACKAGE_LINKED_TO_ORDER",
        message: `Paket sipariş numarasına bağlandı: ${rootOrderNumber}`,
        previousStatus: null,
        nextStatus: newStatus,
        relatedShipmentPackageId: pkgId,
        rawData: { orderNumber, rootOrderNumber } as Prisma.InputJsonValue
      }
    });

    if (isSplitPackage && splitFromPackageId && parentShipmentPackageId) {
      await db.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId: orderRow.id,
          action: "SPLIT_PACKAGE_DETECTED",
          message: `Bu paket üst paketten ayrıldı: ${parentShipmentPackageId}`,
          previousStatus: null,
          nextStatus: newStatus,
          relatedShipmentPackageId: parentShipmentPackageId,
          rawData: {
            childShipmentPackageId: pkgId,
            parentShipmentPackageId
          } as Prisma.InputJsonValue
        }
      });

      await db.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId: splitFromPackageId,
          action: "SPLIT_PACKAGE_DETECTED",
          message: `Yeni split paket: ${pkgId}`,
          previousStatus: null,
          nextStatus: null,
          relatedShipmentPackageId: pkgId,
          rawData: {
            childShipmentPackageId: pkgId,
            parentShipmentPackageId
          } as Prisma.InputJsonValue
        }
      });

      await logIngestActivity(
        actCtx,
        "TRENDYOL_SPLIT_PACKAGE_DETECTED",
        `Split paket: ${pkgId} (üst: ${parentShipmentPackageId})`,
        orderRow.id
      );
    }
  }

  if (existing) {
    const delta = detectPackageLifecycleChange(
      { packageStatus: existing.packageStatus },
      { packageStatus: newStatus }
    );
    if (delta.statusChanged) {
      await db.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId: orderRow.id,
          action: "PACKAGE_STATUS_CHANGED",
          message: delta.transition.note,
          previousStatus: delta.previousStatus,
          nextStatus: delta.nextStatus,
          relatedShipmentPackageId: pkgId,
          rawData: {
            transitionKind: delta.transition.kind
          } as Prisma.InputJsonValue
        }
      });
      await logIngestActivity(
        actCtx,
        "TRENDYOL_PACKAGE_STATUS_CHANGED",
        `Paket ${pkgId}: ${delta.previousStatus ?? "—"} → ${delta.nextStatus ?? "—"}`,
        orderRow.id
      );
    }
  }

  const prevTrackFp = trackingOrderFieldsFingerprint(existing);
  const nextTrackFp = trackingOrderFieldsFingerprint({
    cargoTrackingNumber: tn.cargoTrackingNumber,
    cargoTrackingLink: tn.cargoTrackingLink,
    cargoProviderName: tn.cargoProviderName,
    cargoProviderCode: tn.cargoProviderCode,
    cargoStatusText: tn.cargoStatusText,
    cargoLastEventAt: tn.cargoLastEventAt,
    cargoLastEventMessage: tn.cargoLastEventMessage
  });

  const prevTimelineRows = await db.marketplaceOrderTrackingEvent.findMany({
    where: { storeId, orderId: orderRow.id, shipmentPackageId: pkgId },
    select: { eventTitle: true, eventDateTime: true, eventCode: true }
  });
  const prevTimelineFp = trackingEventsFingerprint(prevTimelineRows);

  await db.marketplaceOrderTrackingEvent.deleteMany({
    where: { storeId, orderId: orderRow.id, shipmentPackageId: pkgId }
  });

  if (tn.persistableEvents.length > 0) {
    await db.marketplaceOrderTrackingEvent.createMany({
      data: tn.persistableEvents.map((ev) => ({
        storeId,
        orderId: orderRow.id,
        shipmentPackageId: pkgId,
        eventCode: ev.eventCode,
        eventTitle: ev.eventTitle,
        eventDescription: ev.eventDescription,
        eventDateTime: ev.eventDateTime,
        rawData: ev.rawData as unknown as Prisma.InputJsonValue
      }))
    });
  }

  const newTimelineFp = trackingEventsFingerprint(
    tn.persistableEvents.map((e) => ({
      eventTitle: e.eventTitle,
      eventDateTime: e.eventDateTime,
      eventCode: e.eventCode
    }))
  );

  const prevLink = existing?.cargoTrackingLink ?? null;
  const nextLink = tn.cargoTrackingLink ?? null;
  const usedBuiltLink = Boolean(
    (tn.trackingRawData as Record<string, unknown> | undefined)?.usedBuiltLink
  );

  if (prevTrackFp !== nextTrackFp) {
    await db.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "TRACKING_DATA_UPDATED",
        message: "Kargo takip bilgisi güncellendi.",
        previousStatus: prevStatus,
        nextStatus: newStatus,
        relatedShipmentPackageId: pkgId,
        rawData: {
          hasTrackingNumber: Boolean(tn.cargoTrackingNumber)
        } as Prisma.InputJsonValue
      }
    });
    await logIngestActivity(
      actCtx,
      "TRENDYOL_TRACKING_UPDATED",
      `Kargo takibi güncellendi (${pkgId}).`,
      orderRow.id
    );
  }

  if (prevTimelineFp !== newTimelineFp) {
    await db.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "TRACKING_EVENT_ADDED",
        message: `Kargo hareket listesi güncellendi (${tn.persistableEvents.length} kayıt).`,
        previousStatus: prevStatus,
        nextStatus: newStatus,
        relatedShipmentPackageId: pkgId,
        rawData: { count: tn.persistableEvents.length } as Prisma.InputJsonValue
      }
    });
    await logIngestActivity(
      actCtx,
      "TRENDYOL_TRACKING_SYNCED",
      `Kargo takip olayları senkronlandı: ${pkgId} (${tn.persistableEvents.length} adım).`,
      orderRow.id
    );
  }

  if (nextLink && usedBuiltLink && prevLink !== nextLink) {
    await db.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "TRACKING_LINK_BUILT",
        message: "Taşıyıcı bilgisinden güvenli takip bağlantısı üretildi.",
        previousStatus: prevStatus,
        nextStatus: newStatus,
        relatedShipmentPackageId: pkgId,
        rawData: { built: true } as Prisma.InputJsonValue
      }
    });
  }

  await db.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: orderRow.id,
      action: "PACKAGE_SYNCED",
      message: `Paket verisi senkronize edildi (${ingestSource}).`,
      previousStatus: prevStatus,
      nextStatus: newStatus,
      relatedShipmentPackageId: pkgId,
      rawData: { ingestSource } as Prisma.InputJsonValue
    }
  });

  await logIngestActivity(
    actCtx,
    "TRENDYOL_PACKAGE_SYNCED",
    `Trendyol paket senkronu: ${pkgId}`,
    orderRow.id
  );

  return { orderId: orderRow.id, shipmentPackageId: pkgId, wasNew: !existing };
}
