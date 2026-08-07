/**
 * Hepsiburada OMS API ham sipariş verisini normalize eder.
 *
 * Hepsiburada sipariş yapısı Trendyol'dan farklı:
 *  - Üst nesne: package (paket)
 *  - İçindeki satırlar: orderLineItemList veya lineItems
 *  - Sipariş numarası: orderNumber (paketin içinde)
 *  - Paket kimliği: id (guid)
 *  - Durum: status (string, "Open" | "Packaged" | "Shipped" | "Delivered" | "Cancelled" | "Returned")
 */

// ─── Yardımcı ────────────────────────────────────────────────────────────────

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && isFinite(v)) return String(v);
  return null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
}

// ─── Paket (sipariş) alanları ────────────────────────────────────────────────

/** Paketin benzersiz kimliği (Hepsiburada: guid) */
export function normalizeHbPackageId(raw: Record<string, unknown>): string | null {
  return str(raw.id) ?? str(raw.packageId) ?? null;
}

/** Sipariş numarası */
export function normalizeHbOrderNumber(raw: Record<string, unknown>): string {
  return (
    str(raw.orderNumber) ??
    str(raw.orderId) ??
    str(raw.id) ??
    "UNKNOWN"
  );
}

/** Paket durumu — Hepsiburada string olarak döner */
export function normalizeHbPackageStatus(raw: Record<string, unknown>): string | null {
  return str(raw.status) ?? str(raw.packageStatus) ?? null;
}

/** Sipariş tarihi (ms epoch veya ISO string) */
export function normalizeHbOrderDateMs(raw: Record<string, unknown>): number | null {
  const v = raw.orderDate ?? raw.createdAt ?? raw.orderCreatedAt;
  if (typeof v === "number" && v > 0) return v;
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.getTime();
  }
  return null;
}

/** Toplam tutar */
export function normalizeHbTotalPrice(raw: Record<string, unknown>): number | null {
  return num(raw.totalPrice) ?? num(raw.totalAmount) ?? null;
}

/** Para birimi */
export function normalizeHbCurrency(raw: Record<string, unknown>): string {
  return str(raw.currency) ?? "TRY";
}

/** Kargo takip numarası */
export function normalizeHbTrackingNumber(raw: Record<string, unknown>): string | null {
  return (
    str(raw.cargoTrackingNumber) ??
    str(raw.trackingNumber) ??
    str(raw.trackNo) ??
    null
  );
}

/** Kargo firması adı */
export function normalizeHbCargoProviderName(raw: Record<string, unknown>): string | null {
  return (
    str(raw.cargoCompany) ??
    str(raw.cargoProviderName) ??
    str(raw.cargoCompanyName) ??
    str(raw.shippingCompany) ??
    null
  );
}

/** Kargo takip linki */
export function normalizeHbCargoTrackingLink(raw: Record<string, unknown>): string | null {
  return str(raw.trackingUrl) ?? str(raw.cargoTrackingLink) ?? null;
}

/** Müşteri adı */
export function normalizeHbCustomerFirstName(raw: Record<string, unknown>): string | null {
  const addr = asRecord(raw.shippingAddress ?? raw.deliveryAddress ?? raw.invoiceAddress);
  return (
    str(raw.customerFirstName) ??
    str(addr?.firstName) ??
    str(addr?.name) ??
    null
  );
}

export function normalizeHbCustomerLastName(raw: Record<string, unknown>): string | null {
  const addr = asRecord(raw.shippingAddress ?? raw.deliveryAddress ?? raw.invoiceAddress);
  return (
    str(raw.customerLastName) ??
    str(addr?.lastName) ??
    null
  );
}

/** Müşteri telefonu (maskelenmiş) */
export function normalizeHbCustomerPhone(raw: Record<string, unknown>): string | null {
  const addr = asRecord(raw.shippingAddress ?? raw.deliveryAddress);
  return (
    str(raw.customerPhone) ??
    str(addr?.phone) ??
    str(addr?.gsm) ??
    null
  );
}

/** Teslimat adresi JSON */
export function normalizeHbShippingAddress(
  raw: Record<string, unknown>
): Record<string, unknown> | null {
  return (
    asRecord(raw.shippingAddress) ??
    asRecord(raw.deliveryAddress) ??
    null
  );
}

/** Fatura adresi JSON */
export function normalizeHbInvoiceAddress(
  raw: Record<string, unknown>
): Record<string, unknown> | null {
  return asRecord(raw.invoiceAddress) ?? asRecord(raw.billingAddress) ?? null;
}

// ─── Satır (line item) alanları ──────────────────────────────────────────────

/** Satır listesini döner */
export function extractHbLines(raw: Record<string, unknown>): unknown[] {
  const candidates = [
    raw.orderLineItemList,
    raw.lineItems,
    raw.items,
    raw.lines,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

export function normalizeHbLineId(line: Record<string, unknown>): string | null {
  return str(line.id) ?? str(line.lineItemId) ?? str(line.orderLineItemId) ?? null;
}

export function normalizeHbLineBarcode(line: Record<string, unknown>): string | null {
  return str(line.barcode) ?? str(line.sku) ?? null;
}

export function normalizeHbLineStockCode(line: Record<string, unknown>): string | null {
  return (
    str(line.merchantSku) ??
    str(line.hepsiburadaSku) ??
    str(line.stockCode) ??
    null
  );
}

export function normalizeHbLineProductName(line: Record<string, unknown>): string | null {
  return str(line.productName) ?? str(line.name) ?? null;
}

export function normalizeHbLineQuantity(line: Record<string, unknown>): number {
  return num(line.quantity) ?? 1;
}

export function normalizeHbLineUnitPrice(line: Record<string, unknown>): number | null {
  return (
    num(line.price) ??
    num(line.unitPrice) ??
    num(line.salePrice) ??
    null
  );
}

export function normalizeHbLineStatus(line: Record<string, unknown>): string | null {
  return str(line.status) ?? str(line.lineStatus) ?? null;
}
