import {
  asRecord,
  normalizeShipmentPackageId
} from "@/lib/trendyolOrderNormalize";

const SELLER_FIELD_KEYS = [
  "supplierId",
  "sellerId",
  "merchantId",
  "supplier_id",
  "seller_id",
  "supplierID",
  "sellerID"
] as const;

export function extractSellerKeyFromRecord(
  r: Record<string, unknown>
): string | null {
  for (const k of SELLER_FIELD_KEYS) {
    const v = r[k];
    if (v != null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function looksLikeShipmentPackage(rec: Record<string, unknown>): boolean {
  if (normalizeShipmentPackageId(rec)) return true;
  if (rec.orderNumber != null || rec.orderNo != null) return true;
  const lines = rec.lines ?? rec.lineItems ?? rec.items ?? rec.orderLines;
  return Array.isArray(lines);
}

const WRAPPER_KEYS = [
  "payload",
  "data",
  "order",
  "shipmentPackage",
  "package",
  "content",
  "orders",
  "event",
  "body"
] as const;

/**
 * Trendyol webhook / push gövdelerindeki dağınık alan adlarını toparlar.
 */
export function parseTrendyolOrderWebhookPayload(body: unknown): {
  sellerKey: string | null;
  packages: Record<string, unknown>[];
} {
  if (body == null) {
    return { sellerKey: null, packages: [] };
  }

  if (Array.isArray(body)) {
    const packages: Record<string, unknown>[] = [];
    let sellerKey: string | null = null;
    for (const item of body) {
      const rec = asRecord(item);
      if (!rec) continue;
      if (!sellerKey) sellerKey = extractSellerKeyFromRecord(rec);
      packages.push(rec);
    }
    return { sellerKey, packages };
  }

  const root = asRecord(body);
  if (!root) {
    return { sellerKey: null, packages: [] };
  }

  let sellerKey = extractSellerKeyFromRecord(root);

  for (const key of WRAPPER_KEYS) {
    const v = root[key];
    if (Array.isArray(v)) {
      const packages: Record<string, unknown>[] = [];
      for (const item of v) {
        const rec = asRecord(item);
        if (!rec) continue;
        if (!sellerKey) sellerKey = extractSellerKeyFromRecord(rec);
        packages.push(rec);
      }
      if (packages.length > 0) {
        return { sellerKey, packages };
      }
      continue;
    }

    const nested = asRecord(v);
    if (nested) {
      if (!sellerKey) sellerKey = extractSellerKeyFromRecord(nested);
      if (looksLikeShipmentPackage(nested)) {
        return { sellerKey, packages: [nested] };
      }
      const innerArr =
        nested.orders ??
        nested.packages ??
        nested.shipmentPackages ??
        nested.content;
      if (Array.isArray(innerArr)) {
        const packages: Record<string, unknown>[] = [];
        for (const item of innerArr) {
          const rec = asRecord(item);
          if (!rec) continue;
          if (!sellerKey) sellerKey = extractSellerKeyFromRecord(rec);
          packages.push(rec);
        }
        if (packages.length > 0) {
          return { sellerKey, packages };
        }
      }
    }
  }

  if (looksLikeShipmentPackage(root)) {
    if (!sellerKey) sellerKey = extractSellerKeyFromRecord(root);
    return { sellerKey, packages: [root] };
  }

  return { sellerKey, packages: [] };
}
