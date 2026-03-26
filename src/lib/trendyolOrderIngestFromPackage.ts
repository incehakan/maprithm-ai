import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  asRecord,
  extractInvoiceShipment,
  extractLinesArray,
  normalizeCargoProvider,
  normalizeCargoTracking,
  normalizeCurrency,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  normalizeLineBarcode,
  normalizeLineCommission,
  normalizeLineId,
  normalizeLineProductName,
  normalizeLineQuantity,
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
  WEBHOOK: "webhook"
} as const;

export type TrendyolOrderIngestSource =
  (typeof TRENDYOL_ORDER_INGEST_SOURCE)[keyof typeof TRENDYOL_ORDER_INGEST_SOURCE];

type DbLike = {
  marketplaceOrder: {
    upsert: typeof prisma.marketplaceOrder.upsert;
  };
  marketplaceOrderLine: {
    deleteMany: typeof prisma.marketplaceOrderLine.deleteMany;
    createMany: typeof prisma.marketplaceOrderLine.createMany;
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
  }
): Promise<{ orderId: string; shipmentPackageId: string }> {
  const { storeId, raw, ingestSource } = params;

  const orderNumber = normalizeOrderNumber(raw);
  const pkgId = packageToStableShipmentId(raw, orderNumber);
  const orderMs = normalizeOrderDateMs(raw);
  const orderDate = orderMs != null ? new Date(orderMs) : new Date();

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
      orderDate,
      shipmentPackageId: pkgId,
      packageStatus: normalizePackageStatus(raw),
      cargoTrackingNumber: normalizeCargoTracking(raw),
      cargoProviderName: normalizeCargoProvider(raw),
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
    },
    update: {
      orderNumber,
      orderDate,
      packageStatus: normalizePackageStatus(raw),
      cargoTrackingNumber: normalizeCargoTracking(raw),
      cargoProviderName: normalizeCargoProvider(raw),
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
      rawData: line as unknown as Prisma.JsonObject
    });
  }

  if (lineRows.length > 0) {
    await db.marketplaceOrderLine.createMany({ data: lineRows });
  }

  return { orderId: orderRow.id, shipmentPackageId: pkgId };
}
