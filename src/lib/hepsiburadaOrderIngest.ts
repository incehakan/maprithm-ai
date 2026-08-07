/**
 * Hepsiburada ham paket verisini MarketplaceOrder + MarketplaceOrderLine tablolarına yazar.
 * Trendyol'daki upsertTrendyolShipmentPackageForStore ile aynı mantık, platform="hepsiburada".
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import {
  asRecord,
  extractHbLines,
  normalizeHbCargoProviderName,
  normalizeHbCargoTrackingLink,
  normalizeHbCurrency,
  normalizeHbCustomerFirstName,
  normalizeHbCustomerLastName,
  normalizeHbCustomerPhone,
  normalizeHbInvoiceAddress,
  normalizeHbLineBarcode,
  normalizeHbLineId,
  normalizeHbLineProductName,
  normalizeHbLineQuantity,
  normalizeHbLineStatus,
  normalizeHbLineStockCode,
  normalizeHbLineUnitPrice,
  normalizeHbOrderDateMs,
  normalizeHbOrderNumber,
  normalizeHbPackageId,
  normalizeHbPackageStatus,
  normalizeHbShippingAddress,
  normalizeHbTotalPrice,
  normalizeHbTrackingNumber,
} from "@/lib/hepsiburadaOrderNormalize";

export const HB_INGEST_SOURCE = {
  MANUAL_SYNC: "manual_sync",
  WEBHOOK: "webhook",
  OPERATION: "operation",
  CRON_SYNC: "cron_sync",
} as const;

export type HbIngestSource = (typeof HB_INGEST_SOURCE)[keyof typeof HB_INGEST_SOURCE];

export type HbIngestResult = {
  orderId: string;
  packageId: string;
  wasNew: boolean;
};

/**
 * Tek Hepsiburada paketi DB'ye yazar (idempotent upsert).
 * packageId olarak Hepsiburada'nın guid id'si kullanılır.
 */
export async function upsertHbPackageForStore(params: {
  storeId: string;
  raw: Record<string, unknown>;
  ingestSource: HbIngestSource;
  activityContext?: { userId: string; membershipId?: string | null };
}): Promise<HbIngestResult> {
  const { storeId, raw, ingestSource, activityContext } = params;

  const packageId = normalizeHbPackageId(raw) ?? `hb-fallback-${Date.now()}`;
  const orderNumber = normalizeHbOrderNumber(raw);
  const orderMs = normalizeHbOrderDateMs(raw);
  const orderDate = orderMs != null ? new Date(orderMs) : new Date();
  const newStatus = normalizeHbPackageStatus(raw);
  const cargoTrackingNumber = normalizeHbTrackingNumber(raw);
  const cargoProviderName = normalizeHbCargoProviderName(raw);
  const cargoTrackingLink = normalizeHbCargoTrackingLink(raw);
  const shippingAddress = normalizeHbShippingAddress(raw);
  const invoiceAddress = normalizeHbInvoiceAddress(raw);

  const existing = await prisma.marketplaceOrder.findUnique({
    where: {
      storeId_platform_shipmentPackageId: {
        storeId,
        platform: "hepsiburada",
        shipmentPackageId: packageId,
      },
    },
    include: { lines: true },
  });

  const prevStatus = existing?.packageStatus ?? null;
  let packageStatusUpdatedAt = existing?.packageStatusUpdatedAt ?? null;
  if (!existing || prevStatus !== newStatus) {
    packageStatusUpdatedAt = new Date();
  }

  const orderRow = await prisma.marketplaceOrder.upsert({
    where: {
      storeId_platform_shipmentPackageId: {
        storeId,
        platform: "hepsiburada",
        shipmentPackageId: packageId,
      },
    },
    create: {
      storeId,
      platform: "hepsiburada",
      orderNumber,
      rootOrderNumber: orderNumber,
      orderDate,
      shipmentPackageId: packageId,
      packageStatus: newStatus,
      packageStatusUpdatedAt: packageStatusUpdatedAt ?? undefined,
      cargoTrackingNumber,
      cargoTrackingLink: cargoTrackingLink ?? undefined,
      cargoProviderName,
      customerFirstName: normalizeHbCustomerFirstName(raw),
      customerLastName: normalizeHbCustomerLastName(raw),
      customerPhoneMasked: normalizeHbCustomerPhone(raw),
      totalPrice: normalizeHbTotalPrice(raw),
      currency: normalizeHbCurrency(raw),
      shipmentAddress: shippingAddress
        ? (shippingAddress as unknown as Prisma.InputJsonValue)
        : undefined,
      invoiceAddress: invoiceAddress
        ? (invoiceAddress as unknown as Prisma.InputJsonValue)
        : undefined,
      rawData: raw as unknown as Prisma.JsonObject,
      lastFetchedAt: new Date(),
      lastIngestSource: ingestSource,
    },
    update: {
      orderNumber,
      orderDate,
      packageStatus: newStatus,
      packageStatusUpdatedAt: packageStatusUpdatedAt ?? undefined,
      cargoTrackingNumber,
      cargoTrackingLink: cargoTrackingLink ?? undefined,
      cargoProviderName,
      customerFirstName: normalizeHbCustomerFirstName(raw),
      customerLastName: normalizeHbCustomerLastName(raw),
      customerPhoneMasked: normalizeHbCustomerPhone(raw),
      totalPrice: normalizeHbTotalPrice(raw),
      currency: normalizeHbCurrency(raw),
      shipmentAddress: shippingAddress
        ? (shippingAddress as unknown as Prisma.InputJsonValue)
        : undefined,
      invoiceAddress: invoiceAddress
        ? (invoiceAddress as unknown as Prisma.InputJsonValue)
        : undefined,
      rawData: raw as unknown as Prisma.JsonObject,
      lastFetchedAt: new Date(),
      lastIngestSource: ingestSource,
    },
  });

  // Satırları sil ve yeniden yaz (idempotent)
  await prisma.marketplaceOrderLine.deleteMany({
    where: { orderId: orderRow.id, storeId },
  });

  const lines = extractHbLines(raw);
  const lineRows: Prisma.MarketplaceOrderLineCreateManyInput[] = [];
  let idx = 0;
  for (const lineItem of lines) {
    const line = asRecord(lineItem);
    if (!line) continue;
    idx += 1;
    lineRows.push({
      storeId,
      orderId: orderRow.id,
      lineId: normalizeHbLineId(line) ?? `hb-idx-${idx}`,
      barcode: normalizeHbLineBarcode(line),
      stockCode: normalizeHbLineStockCode(line),
      productName: normalizeHbLineProductName(line),
      quantity: normalizeHbLineQuantity(line),
      lineUnitPrice: normalizeHbLineUnitPrice(line),
      lineStatus: normalizeHbLineStatus(line),
      rawData: line as unknown as Prisma.JsonObject,
    });
  }
  if (lineRows.length > 0) {
    await prisma.marketplaceOrderLine.createMany({ data: lineRows });
  }

  // Event logları
  if (!existing) {
    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "PACKAGE_CREATED",
        message: `Hepsiburada paketi açıldı (${packageId}).`,
        nextStatus: newStatus,
        relatedShipmentPackageId: packageId,
        rawData: { orderNumber, ingestSource } as Prisma.InputJsonValue,
      },
    });
  } else if (prevStatus !== newStatus) {
    await prisma.marketplaceOrderEvent.create({
      data: {
        storeId,
        orderId: orderRow.id,
        action: "PACKAGE_STATUS_CHANGED",
        message: `Paket durumu değişti: ${prevStatus ?? "—"} → ${newStatus ?? "—"}`,
        previousStatus: prevStatus,
        nextStatus: newStatus,
        relatedShipmentPackageId: packageId,
        rawData: { ingestSource } as Prisma.InputJsonValue,
      },
    });
  }

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: orderRow.id,
      action: "PACKAGE_SYNCED",
      message: `Hepsiburada paket senkronu tamamlandı (${ingestSource}).`,
      previousStatus: prevStatus,
      nextStatus: newStatus,
      relatedShipmentPackageId: packageId,
      rawData: { ingestSource } as Prisma.InputJsonValue,
    },
  });

  if (activityContext?.userId) {
    await createActivityLog({
      userId: activityContext.userId,
      storeId,
      membershipId: activityContext.membershipId ?? undefined,
      action: "HB_PACKAGE_SYNCED",
      entityType: "marketplace_order",
      entityId: orderRow.id,
      message: `Hepsiburada paket senkronu: ${packageId}`,
    });
  }

  return { orderId: orderRow.id, packageId, wasNew: !existing };
}
