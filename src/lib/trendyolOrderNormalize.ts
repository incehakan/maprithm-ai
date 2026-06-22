import { Prisma } from "@prisma/client";

/** Trendyol shipment package / line normalization (eski + yeni alan adları). */

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export function normalizeShipmentPackageId(raw: Record<string, unknown>): string | null {
  const v = raw.shipmentPackageId ?? raw.id ?? raw.shipmentPackageID;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeOrderNumber(raw: Record<string, unknown>): string {
  const v = raw.orderNumber ?? raw.orderNo ?? raw.order_no;
  return v != null && String(v) !== "" ? String(v) : "—";
}

export function normalizeOrderDateMs(raw: Record<string, unknown>): number | null {
  const v = raw.orderDate ?? raw.packageOrderDate ?? raw.createdDate;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return null;
}

export function normalizePackageStatus(raw: Record<string, unknown>): string | null {
  const v =
    raw.shipmentPackageStatus ??
    raw.packageStatus ??
    raw.status ??
    raw.shipmentStatus;
  return v != null && String(v) !== "" ? String(v) : null;
}

export function normalizeCustomerId(raw: Record<string, unknown>): string | null {
  const v = raw.customerId ?? raw.customerid ?? raw.customerNumber;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeDeliveryAddressType(raw: Record<string, unknown>): string | null {
  const v = raw.deliveryAddressType ?? raw.addressType;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeCargoTracking(raw: Record<string, unknown>): string | null {
  const v = raw.cargoTrackingNumber ?? raw.trackingNumber ?? raw.tracking_no;
  if (v == null) return null;
  return String(v);
}

export function normalizeCargoProvider(raw: Record<string, unknown>): string | null {
  const v = raw.cargoProviderName ?? raw.cargoProvider ?? raw.cargoCompany;
  return v != null && String(v) !== "" ? String(v) : null;
}

export function normalizeCustomerEmail(raw: Record<string, unknown>): string | null {
  const v = raw.customerEmail ?? raw.customerEmailMasked ?? raw.email;
  return v != null && String(v) !== "" ? String(v) : null;
}

export function normalizeCustomerPhone(
  raw: Record<string, unknown>,
  shipmentAddress: Record<string, unknown> | null,
  invoiceAddress: Record<string, unknown> | null
): string | null {
  const direct =
    raw.customerPhone ?? raw.customerPhoneMasked ?? raw.phone ?? raw.gsm;
  if (direct != null && String(direct) !== "") return String(direct);
  const s =
    shipmentAddress?.phone ??
    invoiceAddress?.phone ??
    shipmentAddress?.mobilePhone;
  if (s != null && String(s) !== "") return String(s);
  return null;
}

export function normalizeTotalPrice(raw: Record<string, unknown>): number | null {
  const v =
    raw.totalPrice ??
    raw.packageTotalPrice ??
    raw.packageGrossAmount ??
    raw.grossAmount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

export function normalizeCurrency(raw: Record<string, unknown>): string {
  const v = raw.currencyCode ?? raw.currency ?? raw.currency_code;
  return v != null && String(v) !== "" ? String(v) : "TRY";
}

export function extractInvoiceShipment(
  raw: Record<string, unknown>
): [Prisma.JsonValue | null, Prisma.JsonValue | null] {
  const inv = raw.invoiceAddress ?? raw.billingAddress ?? raw.invoice;
  const ship = raw.shipmentAddress ?? raw.deliveryAddress ?? raw.shippingAddress;
  return [
    inv != null ? (inv as Prisma.JsonValue) : null,
    ship != null ? (ship as Prisma.JsonValue) : null
  ];
}

export function normalizeLineId(line: Record<string, unknown>): string | null {
  const v = line.lineId ?? line.id ?? line.orderLineId;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeLineBarcode(line: Record<string, unknown>): string | null {
  const v = line.barcode ?? line.productBarcode ?? line.barcodeValue;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeLineStockCode(line: Record<string, unknown>): string | null {
  const v = line.stockCode ?? line.merchantSku ?? line.merchantSKU ?? line.skuCode;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeLineProductName(line: Record<string, unknown>): string | null {
  const v = line.productName ?? line.name ?? line.title;
  return v != null && String(v) !== "" ? String(v) : null;
}

export function normalizeLineStatus(line: Record<string, unknown>): string | null {
  const v = line.status ?? line.lineStatus;
  if (v == null || v === "") return null;
  return String(v);
}

export function normalizeLineQuantity(line: Record<string, unknown>): number {
  const v = line.quantity ?? line.qty ?? line.amount;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v)) return Math.floor(Number(v));
  return 1;
}

export function normalizeLineUnitPrice(line: Record<string, unknown>): number | null {
  const v =
    line.lineUnitPrice ??
    line.price ??
    line.unitPrice ??
    line.amount ??
    line.lineGrossAmount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

export function normalizeLineVatBase(line: Record<string, unknown>): number | null {
  // Trendyol bu alanı production'da 06.04.2026'dan beri "vatRate" olarak gönderiyor;
  // eski "vatBaseAmount" artık dönmüyor. DB kolon adı (vatBaseAmount) tarihsel nedenle
  // değişmedi — Faz 5'teki genel rename'e bırakıldı. Burada sadece okuma kaynağı düzeltiliyor.
  const v = line.vatRate ?? line.vatBaseAmount ?? line.vatBase ?? line.vatAmount;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

export function normalizeLineCommission(line: Record<string, unknown>): number | null {
  const v = line.commissionAmount ?? line.commission ?? line.commissionFee;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

export function extractLinesArray(raw: Record<string, unknown>): unknown[] {
  const lines = raw.lines ?? raw.lineItems ?? raw.items ?? raw.orderLines;
  if (Array.isArray(lines)) return lines;
  return [];
}
