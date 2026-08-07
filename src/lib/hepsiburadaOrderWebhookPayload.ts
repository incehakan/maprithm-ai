/**
 * Hepsiburada webhook / push gövdelerindeki dağınık alan adlarını toparlar.
 *
 * NOT: Hepsiburada'nın webhook modeli Trendyol'dan farklıdır — HB "reverse
 * webhook" kontratı kullanır: satıcı kendi BaseURL'ini HB'ye bildirir ve HB bu
 * URL altında beklenen path'lere (örn. "/orders") POST atar. Bu parser, hangi
 * path/kontrat kullanılırsa kullanılsın gelen gövdeden merchantId ve paket
 * listesini çıkarmaya çalışır; HB ile kesin kontrat netleştiğinde
 * WRAPPER_KEYS / MERCHANT_FIELD_KEYS listeleri güncellenmelidir.
 */

import { asRecord } from "@/lib/hepsiburadaOrderNormalize";

const MERCHANT_FIELD_KEYS = [
  "merchantId",
  "MerchantId",
  "merchant_id",
  "merchantID",
  "sellerId"
] as const;

export function extractHbMerchantKeyFromRecord(
  r: Record<string, unknown>
): string | null {
  for (const k of MERCHANT_FIELD_KEYS) {
    const v = r[k];
    if (v != null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function looksLikeHbPackage(rec: Record<string, unknown>): boolean {
  if (rec.id != null || rec.packageId != null || rec.packagenumber != null) return true;
  if (rec.orderNumber != null || rec.OrderNumber != null) return true;
  const lines =
    rec.orderLineItemList ?? rec.lineItems ?? rec.items ?? rec.LineItems;
  return Array.isArray(lines);
}

const WRAPPER_KEYS = [
  "payload",
  "data",
  "order",
  "package",
  "content",
  "orders",
  "packages",
  "items",
  "event",
  "body"
] as const;

export function parseHbOrderWebhookPayload(body: unknown): {
  merchantKey: string | null;
  packages: Record<string, unknown>[];
} {
  if (body == null) {
    return { merchantKey: null, packages: [] };
  }

  if (Array.isArray(body)) {
    const packages: Record<string, unknown>[] = [];
    let merchantKey: string | null = null;
    for (const item of body) {
      const rec = asRecord(item);
      if (!rec) continue;
      if (!merchantKey) merchantKey = extractHbMerchantKeyFromRecord(rec);
      packages.push(rec);
    }
    return { merchantKey, packages };
  }

  const root = asRecord(body);
  if (!root) {
    return { merchantKey: null, packages: [] };
  }

  let merchantKey = extractHbMerchantKeyFromRecord(root);

  for (const key of WRAPPER_KEYS) {
    const v = root[key];
    if (Array.isArray(v)) {
      const packages: Record<string, unknown>[] = [];
      for (const item of v) {
        const rec = asRecord(item);
        if (!rec) continue;
        if (!merchantKey) merchantKey = extractHbMerchantKeyFromRecord(rec);
        packages.push(rec);
      }
      if (packages.length > 0) {
        return { merchantKey, packages };
      }
      continue;
    }

    const nested = asRecord(v);
    if (nested) {
      if (!merchantKey) merchantKey = extractHbMerchantKeyFromRecord(nested);
      if (looksLikeHbPackage(nested)) {
        return { merchantKey, packages: [nested] };
      }
    }
  }

  if (looksLikeHbPackage(root)) {
    if (!merchantKey) merchantKey = extractHbMerchantKeyFromRecord(root);
    return { merchantKey, packages: [root] };
  }

  return { merchantKey, packages: [] };
}
