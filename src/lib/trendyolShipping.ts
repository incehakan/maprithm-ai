import { prisma } from "@/lib/prisma";
import { trendyolFetch, trendyolPostJson, trendyolPutJson } from "@/lib/trendyolFetch";
import { getTrendyolStorefrontCode } from "@/lib/trendyolShipmentPackages";
import { buildTrackingLink } from "@/lib/trendyolTracking";

async function getSellerIdForStore(storeId: string): Promise<string> {
  const conn = await prisma.marketplaceConnection.findFirst({
    where: { storeId, platform: "trendyol", isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { sellerId: true }
  });
  if (!conn?.sellerId?.trim()) throw new Error("Trendyol sellerId yok.");
  return conn.sellerId.trim();
}

const sfHeaders = () => ({ storeFrontCode: getTrendyolStorefrontCode() });

export type TrackingPayloadInput = {
  trackingNumber: string;
  providerCode: string;
  cargoSenderNumber?: string | null;
};

export type TrackingPayloadValidated = {
  trackingNumber: string;
  providerCode: string;
  cargoSenderNumber: string;
};

export function validateTrackingPayload(body: unknown):
  | { ok: true; value: TrackingPayloadValidated }
  | { ok: false; message: string } {
  if (body == null || typeof body !== "object") {
    return { ok: false, message: "Geçersiz gövde." };
  }
  const b = body as Record<string, unknown>;
  const trackingNumber = typeof b.trackingNumber === "string" ? b.trackingNumber.trim() : "";
  const providerCode = typeof b.providerCode === "string" ? b.providerCode.trim() : "";
  const cargoSenderNumberRaw = b.cargoSenderNumber;
  const cargoSenderNumber =
    typeof cargoSenderNumberRaw === "string" && cargoSenderNumberRaw.trim()
      ? cargoSenderNumberRaw.trim()
      : "";

  if (!trackingNumber) {
    return { ok: false, message: "trackingNumber zorunlu." };
  }
  if (!providerCode) {
    return { ok: false, message: "providerCode zorunlu." };
  }
  if (!/^[A-Za-z0-9._\-]{1,64}$/.test(providerCode)) {
    return { ok: false, message: "providerCode geçersiz." };
  }
  const sender = cargoSenderNumber || trackingNumber;
  if (sender.length < 2 || sender.length > 128) {
    return { ok: false, message: "Takip / gönderen numarası geçersiz." };
  }
  return {
    ok: true,
    value: {
      trackingNumber,
      providerCode,
      cargoSenderNumber: sender
    }
  };
}

export function buildTrackingPayload(v: TrackingPayloadValidated): Record<string, string> {
  return {
    cargoSenderNumber: v.cargoSenderNumber,
    providerCode: v.providerCode
  };
}

export async function updateTrackingNumberOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  payload: TrackingPayloadValidated;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/tracking-details`;
  const body = buildTrackingPayload(params.payload);
  const res = await trendyolPutJson(params.userId, params.storeId, path, body, {
    extraHeaders: sfHeaders()
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export async function changeCargoProviderOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  providerCode: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/cargo-providers`;
  const code = params.providerCode.trim();
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    { cargoProvider: code },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Desi ve Koli Bilgisi Bildirimi (updateBoxInfo) — developers.trendyol.com'dan .md formatıyla
 * DOĞRULANDI (önceki tahmin doğruymuş). Özellikle Horoz ve CEVA Lojistik kargo firmaları için
 * boxQuantity ve deci alanları zorunludur; diğer kargo firmalarında da gönderilebilir.
 * PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/box-info
 * Body: { boxQuantity: number, deci: number }
 */
export async function updateBoxInfoOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  boxQuantity: number;
  deci: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/box-info`;
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    { boxQuantity: params.boxQuantity, deci: params.deci },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * İşçilik Bedeli Tutarı Gönderme — developers.trendyol.com'dan .md formatıyla doğrulanmış.
 * Sadece belirli kategoriler (mücevher/sarrafiye/takı) için geçerli; laborCostPerItem >= 0 ve
 * satırın faturalandırılacak tutarından büyük olamaz. Paket "delivered" olana kadar güncellenebilir.
 * PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/labor-costs
 * Body: [{ orderLineId, laborCostPerItem }, ...]
 */
export async function updateLaborCostsOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  items: Array<{ orderLineId: number; laborCostPerItem: number }>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/labor-costs`;
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    params.items,
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Depo Bilgisi Güncelleme (updateWarehouse) — developers.trendyol.com'dan .md formatıyla
 * doğrulanmış. Sadece Trendyol Express kullanan satıcılar için geçerli. Paket statusu
 * Created/Invoiced/Picking dışındaysa Trendyol 400 döner.
 * PUT /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/warehouse
 * Body: { warehouseId: number }
 */
export async function updateWarehouseOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  warehouseId: number;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/warehouse`;
  const res = await trendyolPutJson(
    params.userId,
    params.storeId,
    path,
    { warehouseId: params.warehouseId },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────
// Sipariş Paketlerini Bölme (splitShipmentPackage ailesi)
// Kaynak: developers.trendyol.com "Sipariş Paketlerini Bölme (splitShipmentPackage)"
// sayfasının .md (Copy Page) formatından doğrulanmış 4 varyant.
// ───────────────────────────────────────────────────────────────────────

/**
 * Basit bölme: verilen orderLineId'leri mevcut paketten ayırıp yeni bir pakete taşır.
 * Pakette bırakılan satırlar otomatik olarak orijinal (veya başka bir) pakette kalır.
 * POST /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/split
 * Body: { "orderLineIds": [orderLineId, ...] }
 */
export async function splitShipmentPackageOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  orderLineIds: number[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/split`;
  const res = await trendyolPostJson(
    params.userId,
    params.storeId,
    path,
    { orderLineIds: params.orderLineIds },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Tek istekle birden fazla paket oluşturma: orderLineId grupları ayrı paketlere bölünür.
 * Bir pakette olan TÜM orderLine'lar bu servise gönderilmemeli; kalanlar için sistem
 * otomatik olarak ayrı bir paket oluşturur.
 * POST /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/multi-split
 * Body: { "splitGroups": [{ "orderLineIds": [...] }, ...] }
 */
export async function multiSplitShipmentPackageOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  splitGroups: Array<{ orderLineIds: number[] }>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/multi-split`;
  const res = await trendyolPostJson(
    params.userId,
    params.storeId,
    path,
    { splitGroups: params.splitGroups },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Miktar bazlı bölme: aynı orderLineId'nin farklı miktarlarını ayrı paketlere dağıtır
 * (ör. 4 adetlik bir satırı [2,2] olarak iki pakete bölmek).
 * POST /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/quantity-split
 * Body: { "quantitySplit": [{ "orderLineId": ..., "quantities": [2, 2] }] }
 */
export async function splitShipmentPackageByQuantityOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  quantitySplit: Array<{ orderLineId: number; quantities: number[] }>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/quantity-split`;
  const res = await trendyolPostJson(
    params.userId,
    params.storeId,
    path,
    { quantitySplit: params.quantitySplit },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Birden fazla bağımsız paket tanımıyla bölme (her paket kendi orderLineId+miktar listesiyle).
 * POST /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/split-packages
 * Body: { "splitPackages": [{ "packageDetails": [{ "orderLineId": ..., "quantities": ... }] }] }
 */
export async function splitMultiPackageByQuantityOnTrendyol(params: {
  userId: string;
  storeId: string;
  shipmentPackageId: string;
  splitPackages: Array<{
    packageDetails: Array<{ orderLineId: number; quantities: number }>;
  }>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const pkg = encodeURIComponent(params.shipmentPackageId.trim());
  const path = `/integration/order/sellers/${encodeURIComponent(sellerId)}/shipment-packages/${pkg}/split-packages`;
  const res = await trendyolPostJson(
    params.userId,
    params.storeId,
    path,
    { splitPackages: params.splitPackages },
    { extraHeaders: sfHeaders() }
  );
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

export type CommonLabelResult = {
  labelUrl: string | null;
  rawData: unknown;
  format: string | null;
};

function pickLabelFromResponse(data: unknown): CommonLabelResult {
  const rawData = data;
  if (data == null) {
    return { labelUrl: null, rawData, format: null };
  }
  const root = data as Record<string, unknown>;
  const dataArr = root.data;
  if (Array.isArray(dataArr) && dataArr[0] && typeof dataArr[0] === "object") {
    const row = dataArr[0] as Record<string, unknown>;
    const fmt = typeof row.format === "string" ? row.format : null;
    const label =
      typeof row.label === "string"
        ? row.label
        : typeof row.labelUrl === "string"
          ? row.labelUrl
          : typeof row.url === "string"
            ? row.url
            : null;
    return { labelUrl: label?.trim() || null, rawData, format: fmt };
  }
  if (typeof root.label === "string" && root.label.startsWith("http")) {
    return { labelUrl: root.label, rawData, format: typeof root.format === "string" ? root.format : null };
  }
  return { labelUrl: null, rawData, format: null };
}

/**
 * Ortak etiket: önce GET query; gerekirse ZPL oluşturma POST (Trendyol dokümanına göre).
 */
export async function fetchCommonLabelFromTrendyol(params: {
  userId: string;
  storeId: string;
  /** Trendyol'un getShipmentPackages ile verdiği takip / barkod referansı */
  queryId: string;
}): Promise<{ ok: true; result: CommonLabelResult } | { ok: false; message: string }> {
  const sellerId = await getSellerIdForStore(params.storeId);
  const qid = params.queryId.trim();
  const headers = sfHeaders();

  const pathsGet = [
    `/integration/sellers/${encodeURIComponent(sellerId)}/common-label/query?id=${encodeURIComponent(qid)}`,
    `/integration/order/sellers/${encodeURIComponent(sellerId)}/common-label/query?id=${encodeURIComponent(qid)}`
  ];

  for (const path of pathsGet) {
    const res = await trendyolFetch<unknown>(params.userId, params.storeId, path, {
      extraHeaders: headers
    });
    if (!res.ok) continue;
    const picked = pickLabelFromResponse(res.data);
    if (picked.labelUrl || picked.rawData != null) {
      return { ok: true, result: picked };
    }
  }

  const postPaths = [
    `/integration/sellers/${encodeURIComponent(sellerId)}/common-label/${encodeURIComponent(qid)}`,
    `/integration/order/sellers/${encodeURIComponent(sellerId)}/common-label/${encodeURIComponent(qid)}`
  ];
  for (const path of postPaths) {
    const res = await trendyolPostJson<unknown>(
      params.userId,
      params.storeId,
      path,
      {
        format: "ZPL",
        boxQuantity: 1
      },
      { extraHeaders: headers }
    );
    if (!res.ok) continue;
    const picked = pickLabelFromResponse(res.data);
    if (picked.labelUrl || picked.rawData != null) {
      return { ok: true, result: picked };
    }
  }

  return {
    ok: false,
    message:
      "Ortak etiket alınamadı (endpoint veya paket durumu uygun olmayabilir; takip numarasını kontrol edin)."
  };
}

export async function resolveProviderNameFromReference(
  providerCode: string
): Promise<string | null> {
  const row = await prisma.marketplaceCarrierReference.findFirst({
    where: { platform: "trendyol", providerCode: providerCode.trim(), isActive: true },
    select: { providerName: true }
  });
  return row?.providerName ?? null;
}

export function buildLocalTrackingLinkAfterUpdate(
  trackingNumber: string,
  providerCode: string,
  providerName: string | null
): string | null {
  return buildTrackingLink(trackingNumber, providerCode, providerName);
}
