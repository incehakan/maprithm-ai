/**
 * Hepsiburada sipariş aksiyon servisi.
 *
 * KAYNAK: developers.hepsiburada.com resmi API referansı (2026-08-02 tarihinde
 * doğrulandı). Önceki oturumlarda bu dosya Trendyol'un "Picking/Packaged/
 * Shipped/Cancelled" aksiyon modelinden tahminle uyarlanmıştı — HB'nin gerçek
 * paket modeli KÖKTEN FARKLI. Bu oturumda dokümantasyona göre yeniden yazıldı.
 *
 * GERÇEK HB SİPARİŞ/PAKET AKIŞI (satıcı öder / entegre kargo modeli):
 *   1. Sipariş "Open" statüsünde gelir (kalemler henüz paketlenmemiş).
 *   2. Kalem(ler) paketlenir → POST {OMS}/packages/merchantid/{merchantId}
 *      body: { lineItemRequests: [{ id, quantity }], parcelQuantity?, deci?,
 *              cargoCompany?, carrier? }
 *      → yanıt bir paket nesnesi döner, status:"Open" ve packageNumber içerir.
 *      HB'de ayrı bir "Picking" statüsü/aksiyonu YOKTUR — paketleme tek adımdır.
 *   3. Paket entegre kargo firmasına otomatik teslim edilir (Trendyol'daki gibi
 *      ayrı bir "Shipped" bildirimi YOKTUR — satıcı öder modelinde kargo süreci
 *      HB/kargo firması tarafından yürütülür).
 *   4. Kargo, paketi son kullanıcıya teslim ettiğinde satıcı bunu bildirir:
 *      POST {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/deliver
 *      (teslim edilemediyse .../undeliver)
 *   5. Kalem iptali — YALNIZCA paketlenmemiş ("Open") kalemler için:
 *      POST {OMS}/lineitems/merchantid/{merchantId}/id/{lineItemId}/cancelbymerchant
 *      body: { reasonId: "<kod>" }  (örn. 83 = "Ürün tedarik edilemedi")
 *      Paket zaten oluşmuşsa önce /packagenumber/{packagenumber}/unpack ile
 *      paket bozulmalı, sonra bu endpoint çağrılmalıdır.
 *
 * NOT — "Mağaza Hesabı" (kendi kargon) modeli: ek olarak "intransit"
 * adımı vardır — bkz. sendHbIntransitAction (SIT listesiyle doğrulandı,
 * 03.08.2026). Store'un hangi modelde olduğu MarketplaceConnection'da
 * henüz ayrı bir alanla tutulmuyor.
 *
 * NOT — fatura: POST .../packagenumber/{packageNumber}/invoice
 * Path SIT listesiyle doğrulandı (03.08.2026). Body alan adları
 * (invoiceNumber / invoiceUrl) hâlâ teyit bekliyor — tahmini bırakıldı.
 */

import { prisma } from "@/lib/prisma";
import { hbFetch, hbPostJson, hbPutJson, getHbMerchantId } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

// ─── Tip tanımları (route'ların bağlı olduğu sözleşme) ──────────────────────

export type HbPackageActionResult = {
  ok: true;
  trendyolData?: unknown; // tarihsel alan adı; korunuyor (5 route buna bağlı)
  sentStatus: string;
  labelUrl?: string | null;
  trackingNumber?: string | null;
} | {
  ok: false;
  message: string;
};

export type HbPackageLineItem = { id: string; quantity: number };

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function pickPackageNumber(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const v = d.packageNumber ?? d.packagenumber;
  return typeof v === "string" ? v : v != null ? String(v) : null;
}

function pickLabelUrl(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return (
    (typeof d.labelUrl === "string" ? d.labelUrl : null) ??
    (typeof d.label === "string" && d.label.startsWith("http") ? d.label : null) ??
    null
  );
}

function pickTrackingNumber(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  return (
    (typeof d.trackingInfoCode === "string" ? d.trackingInfoCode : null) ??
    (typeof d.trackingNumber === "string" ? d.trackingNumber : null) ??
    (typeof d.cargoTrackingNumber === "string" ? d.cargoTrackingNumber : null) ??
    null
  );
}

// ─── Kalem(ler)i paketleme (ortak çekirdek) ──────────────────────────────────
// POST {OMS}/packages/merchantid/{merchantId}
// body: { lineItemRequests: [{ id, quantity }], parcelQuantity?, deci?,
//         cargoCompany?, carrier? }
// Doğrulandı: developers.hepsiburada.com — SIT listesiyle teyit edildi (03.08.2026).

async function createHbPackage(params: {
  storeId: string;
  lineItemRequests: HbPackageLineItem[];
  parcelQuantity?: number;
  deci?: number;
  cargoCompany?: string; // yalnızca "MP" (mağaza hesabı) — normalde boş bırakılır
  carrier?: string;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}`;

  const body: Record<string, unknown> = {
    lineItemRequests: params.lineItemRequests.map((l) => ({
      id: l.id,
      quantity: String(l.quantity),
    })),
  };
  if (params.parcelQuantity != null) body.parcelQuantity = params.parcelQuantity;
  if (params.deci != null) body.deci = params.deci;
  if (params.cargoCompany) body.cargoCompany = params.cargoCompany;
  if (params.carrier) body.carrier = params.carrier;

  const res = await hbPostJson(params.storeId, "OMS", path, body);
  if (!res.ok) return { ok: false, message: res.message };

  return {
    ok: true,
    sentStatus: "Package",
    trendyolData: res.data,
    labelUrl: pickLabelUrl(res.data),
    trackingNumber: pickPackageNumber(res.data) ?? pickTrackingNumber(res.data),
  };
}

// ─── Picking ─────────────────────────────────────────────────────────────────
// HB'de ayrı bir "Picking" aksiyonu/statüsü YOKTUR. Bu fonksiyon, çağıran
// route sözleşmesini bozmamak için korunuyor ama artık gerçek paketleme
// çağrısını (createHbPackage) tetikliyor — yani "Picking" ve "Packaged"
// route'ları artık AYNI HB işlemine karşılık geliyor.

export async function sendHbPickingAction(params: {
  storeId: string;
  lineItems: HbPackageLineItem[];
}): Promise<HbPackageActionResult> {
  if (params.lineItems.length === 0) {
    return { ok: false, message: "Paketlenecek kalem bulunamadı." };
  }
  return createHbPackage({ storeId: params.storeId, lineItemRequests: params.lineItems });
}

// ─── Packaged (paket oluştur) ─────────────────────────────────────────────────
// Aynı gerçek endpoint. cargoCompany yalnızca mağaza hesabı (kendi kargon)
// modelinde "MP" olarak gönderilmelidir; standart modelde boş bırakılır.

export type HbPackagedPayload = {
  lineItems: HbPackageLineItem[];
  cargoCompany?: string;
  parcelQuantity?: number;
  deci?: number;
};

export async function sendHbPackagedAction(params: {
  storeId: string;
  payload: HbPackagedPayload;
}): Promise<HbPackageActionResult> {
  if (params.payload.lineItems.length === 0) {
    return { ok: false, message: "Paketlenecek kalem bulunamadı." };
  }
  return createHbPackage({
    storeId: params.storeId,
    lineItemRequests: params.payload.lineItems,
    cargoCompany: params.payload.cargoCompany,
    parcelQuantity: params.payload.parcelQuantity,
    deci: params.payload.deci,
  });
}

// ─── Deliver / Undeliver / Intransit ─────────────────────────────────────────
// POST {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/deliver
// POST {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/undeliver
// POST {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/intransit
// SIT listesiyle teyit edildi (03.08.2026).
// packageNumber = HB packageNumber (DB guid'i DEĞİL — extractHbPackageNumber).

export async function sendHbShippedAction(params: {
  storeId: string;
  packageNumber: string;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/deliver`;

  const res = await hbPostJson(params.storeId, "OMS", path, {});
  if (!res.ok) return { ok: false, message: res.message };

  return { ok: true, sentStatus: "Delivered", trendyolData: res.data };
}

export async function sendHbUndeliverAction(params: {
  storeId: string;
  packageNumber: string;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/undeliver`;

  const res = await hbPostJson(params.storeId, "OMS", path, {});
  if (!res.ok) return { ok: false, message: res.message };

  return { ok: true, sentStatus: "Undelivered", trendyolData: res.data };
}

/**
 * Mağaza Hesabı (kendi kargon) — paket yolda bildirimi.
 * Method: POST
 * Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/intransit
 * SIT listesiyle doğrulandı (03.08.2026). Body yok.
 */
export async function sendHbIntransitAction(params: {
  storeId: string;
  packageNumber: string;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/intransit`;

  const res = await hbPostJson(params.storeId, "OMS", path, {});
  if (!res.ok) return { ok: false, message: res.message };

  return { ok: true, sentStatus: "InTransit", trendyolData: res.data };
}

// ─── Cancel (kalem iptali — yalnızca paketlenmemiş kalemler) ─────────────────
// POST {OMS}/lineitems/merchantid/{merchantId}/id/{lineItemId}/cancelbymerchant
// body: { reasonId: "<kod>" }
// SIT listesiyle teyit edildi (03.08.2026).
// KISIT: yalnızca "Open" kalemler. Paket varsa önce unpack.

export async function sendHbCancelAction(params: {
  storeId: string;
  lineItemId: string;
  reasonId: number;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/lineitems/merchantid/${encodeURIComponent(merchantId)}/id/${encodeURIComponent(params.lineItemId)}/cancelbymerchant`;

  const res = await hbPostJson(params.storeId, "OMS", path, { reasonId: String(params.reasonId) });
  if (!res.ok) return { ok: false, message: res.message };

  return { ok: true, sentStatus: "Cancelled", trendyolData: res.data };
}

// ─── Fatura linki gönderme ────────────────────────────────────────────────────
/**
 * Method: POST
 * Path: /packages/merchantid/{merchantId}/packagenumber/{packageNumber}/invoice
 * SIT listesiyle doğrulandı (03.08.2026) — önceki `/invoice-link` YANLIŞTI.
 * Body şekli (invoiceNumber / invoiceUrl) hâlâ teyit bekliyor; alan adları
 * tahmini bırakıldı.
 */
export type HbInvoicePayload = {
  invoiceNumber: string;
  invoiceUrl: string;
  invoiceDate?: string; // ISO string
};

export async function sendHbInvoiceLink(params: {
  storeId: string;
  packageNumber: string;
  payload: HbInvoicePayload;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/invoice`;

  const body: Record<string, unknown> = {
    invoiceNumber: params.payload.invoiceNumber,
    invoiceUrl: params.payload.invoiceUrl,
  };
  if (params.payload.invoiceDate) body.invoiceDate = params.payload.invoiceDate;

  const res = await hbPostJson(params.storeId, "OMS", path, body);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, data: res.data };
}

// ─── Unpack (paketi boz) ──────────────────────────────────────────────────────
// POST {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/unpack
// SIT listesiyle teyit edildi (03.08.2026). Body yok.

export async function sendHbUnpackAction(params: {
  storeId: string;
  packageNumber: string;
}): Promise<HbPackageActionResult> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/unpack`;

  const res = await hbPostJson(params.storeId, "OMS", path, {});
  if (!res.ok) return { ok: false, message: res.message };

  return { ok: true, sentStatus: "Unpacked", trendyolData: res.data };
}

/**
 * Kalem iptalini, paket durumunu kontrol ederek doğru sırayla yürütür:
 * paket zaten oluşmuşsa (packageNumber DB'de mevcutsa) önce unpack çağrılır,
 * sonra cancelbymerchant denenir. Dokümantasyon notu: "Eğer siparişin paketi
 * var ise önce paket bozulup daha sonra bu endpoint çağırılmalıdır."
 * (bkz. developers.hepsiburada.com/en/siparis-entegrasyonu/iptal-bilgisi-gonderme)
 */
export async function sendHbCancelActionSafe(params: {
  storeId: string;
  lineItemId: string;
  reasonId: number;
  packageNumber?: string; // biliniyorsa geçilir; paket varsa önce unpack denenir
}): Promise<HbPackageActionResult> {
  if (params.packageNumber) {
    const unpackRes = await sendHbUnpackAction({
      storeId: params.storeId,
      packageNumber: params.packageNumber,
    });
    // unpack başarısız olsa bile devam edilir — paket zaten yoksa (Open
    // statüsündeyse) HB muhtemelen 404/409 döner ve bu görmezden gelinebilir;
    // asıl hata varsa zaten sendHbCancelAction 502 ile yüzeye çıkaracaktır.
    if (!unpackRes.ok) {
      logger.warn("hb_unpack_before_cancel_failed", {
        storeId: params.storeId,
        packageNumber: params.packageNumber,
        message: unpackRes.message,
      });
    }
  }
  return sendHbCancelAction({
    storeId: params.storeId,
    lineItemId: params.lineItemId,
    reasonId: params.reasonId,
  });
}

// ─── Kargo firması (paket seviyesi) ──────────────────────────────────────────
// GET {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/changablecargocompanies
// PUT {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/changecargocompany
// SIT listesiyle teyit edildi (03.08.2026).
// PUT body alanı `cargoCompany` (OpenAPI/Lonca); değer genelde GET'teki ShortName/code.
// Not: Kalem seviyesindeki kargo değişimi için hepsiburadaOrderLineCargo.ts
// (paketlemeden ÖNCE) — bu ikisini karıştırma.

/**
 * Method: GET
 * Path: /packages/merchantid/{merchantId}/packagenumber/{packageNumber}/changablecargocompanies
 * SIT listesiyle doğrulandı (03.08.2026).
 */
export async function fetchHbChangeableCargoCompanies(params: {
  storeId: string;
  packageNumber: string;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/changablecargocompanies`;

  const res = await hbFetch(params.storeId, "OMS", path);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, data: res.data };
}

/**
 * Method: PUT
 * Path: /packages/merchantid/{merchantId}/packagenumber/{packageNumber}/changecargocompany
 * Body: `{ cargoCompany: string }` — değer olarak GET changablecargocompanies
 * yanıtındaki ShortName / code kullanılır (alan adı `cargoCompany`, değer ShortName).
 *
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 * packageNumber: extractHbPackageNumber() ile DB'den çıkarılmalı.
 */
export async function changeHbPackageCargoCompany(params: {
  storeId: string;
  packageNumber: string;
  cargoCompanyShortName: string;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const shortName = params.cargoCompanyShortName.trim();
  if (!shortName) {
    return { ok: false, message: "cargoCompanyShortName zorunludur." };
  }
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/changecargocompany`;

  const res = await hbPutJson(params.storeId, "OMS", path, {
    cargoCompany: shortName,
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true, data: res.data };
}

/**
 * Method: GET
 * Path: /lineitems/merchantid/{merchantId}/packageablewith/lineitemid/{lineItemId}
 * SIT listesiyle doğrulandı (03.08.2026).
 * Beraber paketlenebilecek kalem yoksa HB 404 dönebilir — boş liste sayılır.
 */
export async function fetchHbPackageableWithLineItems(params: {
  storeId: string;
  lineItemId: string;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  const lineItemId = params.lineItemId.trim();
  if (!lineItemId) {
    return { ok: false, message: "lineItemId zorunludur." };
  }
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/lineitems/merchantid/${encodeURIComponent(merchantId)}/packageablewith/lineitemid/${encodeURIComponent(lineItemId)}`;

  const res = await hbFetch(params.storeId, "OMS", path);
  if (!res.ok) {
    if (res.status === 404) {
      return { ok: true, data: [] };
    }
    return { ok: false, message: res.message };
  }
  return { ok: true, data: res.data };
}

// ─── DB rawData'dan gerçek HB packageNumber'ını çıkarma ──────────────────────
// ÖNEMLİ: MarketplaceOrder.shipmentPackageId, HB'nin "id" (guid) alanını
// tutar (bkz. hepsiburadaOrderNormalize.ts → normalizeHbPackageId: raw.id ??
// raw.packageId). Ancak deliver/undeliver/unpack/split/labels gibi TÜM paket
// aksiyon endpoint'leri HB'nin "packageNumber" alanını ister — guid'i DEĞİL.
// Bu yardımcı, DB'de saklanan ham HB yanıtından (rawData) gerçek
// packageNumber'ı çıkarır. rawData yoksa veya packageNumber bulunamazsa
// shipmentPackageId'ye (guid) geri düşer — bu durumda HB muhtemelen 404 döner,
// ama en azından sessizce yanlış veri göndermek yerine hatayı yüzeye çıkarır.

export function extractHbPackageNumber(order: {
  shipmentPackageId: string;
  rawData?: unknown;
}): string {
  const raw = order.rawData;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    const v = r.packageNumber ?? r.packagenumber;
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return order.shipmentPackageId;
}

// ─── DB'ye aksiyon sonucunu yaz ──────────────────────────────────────────────

export async function persistHbActionResult(params: {
  orderId: string;
  storeId: string;
  action: string;
  sentStatus: string;
  trendyolData: unknown;
  labelUrl?: string | null;
  trackingNumber?: string | null;
  cargoProviderName?: string | null;
}): Promise<void> {
  await prisma.marketplaceOrder.updateMany({
    where: { id: params.orderId, storeId: params.storeId },
    data: {
      packageStatus: params.sentStatus,
      lastFetchedAt: new Date(),
      packageStatusUpdatedAt: new Date(),
      lastIngestSource: "operation",
      ...(params.labelUrl ? { cargoLabelUrl: params.labelUrl } : {}),
      ...(params.trackingNumber ? { cargoTrackingNumber: params.trackingNumber } : {}),
      ...(params.cargoProviderName ? { cargoProviderName: params.cargoProviderName } : {}),
    },
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId: params.storeId,
      orderId: params.orderId,
      action: `HB_${params.action.toUpperCase()}`,
      message: `Hepsiburada ${params.action} işlemi tamamlandı. Yeni durum: ${params.sentStatus}`,
      nextStatus: params.sentStatus,
      rawData: (params.trendyolData ?? {}) as Prisma.InputJsonValue,
    },
  });
}
