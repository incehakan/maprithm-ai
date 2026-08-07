/**
 * Hepsiburada iade (claim/talep) servisi.
 *
 * KAYNAK: developers.hepsiburada.com resmi API referansı (2026-08-02 tarihinde
 * doğrulandı — bkz. post_claims-number-claimnumber-accept /
 * get_claims-merchantid-merchantid sayfaları). Tüm claim endpoint'leri OMS
 * base URL'i altındadır (returns-external DEĞİL):
 *
 *  - GET  {OMS}/claims/merchantId/{merchantId}                    → tüm talepler (Limit/Offset zorunlu, limit 1-100)
 *  - GET  {OMS}/claims/merchantId/{merchantId}/status/{status}     → statüye göre talepler
 *  - POST {OMS}/claims/number/{claimNumber}/accept                 → talebi onayla
 *      body: { FinalizedWith?: "Refund" | "Change", InvoiceLink?: string, AcceptionReason?: string }
 *      body boş/omitted gönderilirse HB tarafında "İade" (Refund) olarak onaylanır.
 *      response: 204 No Content
 *  - POST {OMS}/claims/number/{claimNumber}/reject                 → talebi reddet
 *      body: { ClaimRejectionReason: string, MerchantStatement: string }
 *      response: 204 No Content
 *
 * "claimNumber" claim listesindeki "claimNumber"/"number" alanıdır — DB'deki
 * claimId kolonu bu değeri tutar (bkz. upsertHbReturnClaimFromRaw).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  hbFetch,
  hbPostJson,
  getHbMerchantId,
  getHbEnvironment,
} from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

// ─── Talep listesi çekme ─────────────────────────────────────────────────────

type HbClaimsResponse = {
  items?: unknown[];
  data?: unknown[];
  content?: unknown[];
  totalCount?: number;
};

function extractClaims(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const r = data as HbClaimsResponse | null;
  if (!r) return [];
  return r.items ?? r.data ?? r.content ?? [];
}

export async function fetchHbReturnClaims(params: {
  storeId: string;
  status?: string;
  limit?: number;
  offset?: number;
  maxPages?: number;
}): Promise<{ ok: true; items: unknown[] } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(params.storeId);

  const limit = params.limit ?? 50;
  const maxPages = params.maxPages ?? 40;
  const all: unknown[] = [];
  let offset = params.offset ?? 0;
  let page = 0;

  while (page < maxPages) {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset)
    });
    const path = params.status
      ? `/claims/merchantId/${encodeURIComponent(merchantId)}/status/${encodeURIComponent(params.status)}?${qs.toString()}`
      : `/claims/merchantId/${encodeURIComponent(merchantId)}?${qs.toString()}`;

    const res = await hbFetch<HbClaimsResponse>(params.storeId, "OMS", path);
    if (!res.ok) return { ok: false, message: res.message };

    const chunk = extractClaims(res.data);
    all.push(...chunk);
    if (chunk.length < limit) break;

    offset += limit;
    page += 1;
  }

  return { ok: true, items: all };
}

/**
 * Talebi REDDETME (ClaimRejectionReason) enum listesi — HB dokümantasyonundaki
 * "Talep Reddetme (Reject Request)" bölümü. Claim tipine göre iki ayrı grup
 * mevcuttur; ikisi birbirine karıştırılamaz (HB tarafı geçersiz enum için 400
 * döner). Bu liste, önceki oturumda kullanılan (ve aslında "müşterinin talep
 * açma nedeni" enum'u olan, reject için YANLIŞ) listenin yerine geçer.
 *
 * group: "return" → Return / RenewProduct talepleri için
 * group: "missingItem" → MissingItem / MissingPart talepleri için
 */
export async function fetchHbReturnReasons(): Promise<
  Array<{ code: string; name: string; group: "return" | "missingItem" }>
> {
  return [
    // Return (İade) & RenewProduct (Temin)
    { code: "CustomerReturnedWrongItem", name: "İade edilen ürün siparişteki ürün değildir", group: "return" },
    { code: "ProductIsDamaged", name: "İade edilen ürün kusurlu/hasarlı", group: "return" },
    { code: "MissingQuantity", name: "İade edilen ürünün adedi eksik", group: "return" },
    { code: "NoSuchAccessory", name: "İade ürün kullanılmış, tekrar satılabilir değil", group: "return" },
    { code: "BoxIsEmptyWithReport", name: "İade edilen ürünün paketi boş, tutanak mevcut", group: "return" },
    { code: "BoxIsEmptyWithoutReport", name: "İade edilen ürünün paketi boş, tutanak yok", group: "return" },
    {
      code: "SomePartsOrSomeAccessoriesOrSomePapersAreMissing",
      name: "İade edilen ürünün parçası/aksesuarı/faturası eksik",
      group: "return"
    },
    { code: "ReturnedProductIsNotDelivered", name: "İade edilen ürün teslim edilmedi", group: "return" },
    { code: "NewProductWillBeSent", name: "Müşteriye yeni ürün gönderilecek", group: "return" },
    { code: "ExtraProductHasBeenReturned", name: "Müşteri fazla gönderilen ürünü iade etti", group: "return" },
    { code: "ProductNotWrong", name: "Müşteriye gönderilen ürün yanlış değil", group: "return" },
    { code: "ProductNotDefective", name: "Müşteriye gönderilen ürün kusurlu değil", group: "return" },
    { code: "StockProblem", name: "Stok sorunu nedeniyle değişim yapılamıyor", group: "return" },
    { code: "ReturnedProductHasAccountOrPassword", name: "Üründe hesap/şifre tanımlı", group: "return" },
    { code: "MarkedAsServiceProcess", name: "İade ürün servis/analiz sürecine alınacak", group: "return" },
    { code: "Other", name: "Diğer", group: "return" },
    // MissingItem (Eksik Ürün) & MissingPart (Eksik Parça)
    { code: "ProductSentComplete", name: "Ürün eksiksiz gönderildi", group: "missingItem" },
    { code: "MissingItemOrPartCannotBeSupplied", name: "Eksik ürün/parça tedarik edilemiyor", group: "missingItem" },
    {
      code: "ClaimedComponentIsNotPartOfTheProduct",
      name: "Talep edilen parça paket içeriğine dahil değil",
      group: "missingItem"
    },
    { code: "InvoiceReplacesWarranty", name: "Fatura garanti belgesi yerine geçer", group: "missingItem" },
    {
      code: "PartialShipmentMissingPackageWillBeDelivered",
      name: "Parçalı sevkiyat, eksik paket teslim edilecek",
      group: "missingItem"
    },
    { code: "CustomerProblemSolved", name: "Müşteri sorunu çözüldü", group: "missingItem" },
    { code: "Other", name: "Diğer", group: "missingItem" }
  ];
}

// ─── Normalize + DB upsert ──────────────────────────────────────────────────

function deriveHbClaimStatus(raw: Record<string, unknown>): string {
  return (
    str(raw.status) ??
    str(raw.claimStatus) ??
    str(raw.claimItemStatus) ??
    "Unknown"
  );
}

function deriveHbReasonText(raw: Record<string, unknown>): { id: string | null; text: string | null } {
  const reason = asRecord(raw.reason) ?? asRecord(raw.claimReason);
  return {
    id: reason?.id != null ? String(reason.id) : str(raw.reasonId),
    text: str(reason?.name) ?? str(raw.reasonText)
  };
}

export async function upsertHbReturnClaimFromRaw(params: {
  storeId: string;
  raw: Record<string, unknown>;
}): Promise<{ id: string; claimId: string }> {
  // Öncelik: claimNumber/number (accept/reject endpoint'lerinde path param olarak
  // kullanılan resmi "talep numarası"), sonra id/claimId fallback (bazı eski/farklı
  // response şekillerinde bu alanlar da görülebiliyor).
  const claimId =
    str(params.raw.claimNumber) ??
    str(params.raw.number) ??
    str(params.raw.id) ??
    str(params.raw.claimId);
  if (!claimId) throw new Error("claimId yok");

  const claimDateMs =
    num(params.raw.claimDate) ??
    (str(params.raw.claimDate) ? new Date(String(params.raw.claimDate)).getTime() : null) ??
    Date.now();
  const claimDate = new Date(claimDateMs);

  const orderNumber = str(params.raw.orderNumber);
  const pkgId = str(params.raw.packageNumber) ?? str(params.raw.packagenumber) ?? str(params.raw.packageId);

  const reason = deriveHbReasonText(params.raw);
  const claimStatus = deriveHbClaimStatus(params.raw);

  const row = await prisma.marketplaceReturnClaim.upsert({
    where: {
      storeId_platform_claimId: {
        storeId: params.storeId,
        platform: "hepsiburada",
        claimId
      }
    },
    create: {
      storeId: params.storeId,
      platform: "hepsiburada",
      claimId,
      orderNumber,
      shipmentPackageId: pkgId,
      claimDate,
      claimStatus,
      returnReasonId: reason.id,
      returnReasonText: reason.text,
      cargoTrackingNumber: str(params.raw.cargoTrackingNumber),
      cargoProviderName: str(params.raw.cargoCompany) ?? str(params.raw.cargoProviderName),
      customerFirstName: str(params.raw.customerFirstName),
      customerLastName: str(params.raw.customerLastName),
      totalPrice: num(params.raw.totalPrice),
      currency: str(params.raw.currency) ?? "TRY",
      rawData: params.raw as unknown as Prisma.InputJsonValue,
      lastFetchedAt: new Date()
    },
    update: {
      orderNumber,
      shipmentPackageId: pkgId,
      claimDate,
      claimStatus,
      returnReasonId: reason.id,
      returnReasonText: reason.text,
      cargoTrackingNumber: str(params.raw.cargoTrackingNumber),
      cargoProviderName: str(params.raw.cargoCompany) ?? str(params.raw.cargoProviderName),
      customerFirstName: str(params.raw.customerFirstName),
      customerLastName: str(params.raw.customerLastName),
      totalPrice: num(params.raw.totalPrice),
      rawData: params.raw as unknown as Prisma.InputJsonValue,
      lastFetchedAt: new Date()
    }
  });

  await prisma.marketplaceReturnClaimLine.deleteMany({
    where: { claimIdRef: row.id, storeId: params.storeId }
  });

  const items = params.raw.items ?? params.raw.lineItems ?? params.raw.claimItems;
  if (Array.isArray(items)) {
    const lineRows: Prisma.MarketplaceReturnClaimLineCreateManyInput[] = [];
    for (const it of items) {
      const rec = asRecord(it);
      if (!rec) continue;
      lineRows.push({
        storeId: params.storeId,
        claimIdRef: row.id,
        lineId: str(rec.id) ?? str(rec.lineItemId),
        barcode: str(rec.barcode) ?? str(rec.sku),
        stockCode: str(rec.merchantSku) ?? str(rec.stockCode),
        productName: str(rec.productName) ?? str(rec.name),
        quantity: num(rec.quantity) ?? 1,
        lineUnitPrice: num(rec.price) ?? num(rec.unitPrice),
        rawData: rec as unknown as Prisma.InputJsonValue
      });
    }
    if (lineRows.length > 0) {
      await prisma.marketplaceReturnClaimLine.createMany({ data: lineRows });
    }
  }

  return { id: row.id, claimId };
}

export async function syncHbReturnClaimsToStore(params: {
  storeId: string;
  status?: string;
}): Promise<{ synced: number; errors: number }> {
  const pull = await fetchHbReturnClaims({ storeId: params.storeId, status: params.status });
  if (!pull.ok) throw new Error(pull.message);

  let synced = 0;
  let errors = 0;

  for (const item of pull.items) {
    const raw = asRecord(item);
    if (!raw) {
      errors += 1;
      continue;
    }
    try {
      const { id } = await upsertHbReturnClaimFromRaw({ storeId: params.storeId, raw });
      await prisma.marketplaceReturnClaimEvent.create({
        data: {
          storeId: params.storeId,
          claimRecordId: id,
          action: "RETURN_CLAIM_SYNCED",
          message: "Hepsiburada iade kaydı senkronlandı.",
          rawData: { claimId: raw.id ?? raw.claimId } as object
        }
      });
      synced += 1;
    } catch {
      errors += 1;
    }
  }

  return { synced, errors };
}

/**
 * Tek bir talebi HB'den güncel haliyle çekip DB'ye yansıtır.
 *
 * NOT (2026-08-02 dokümantasyon taraması): HB'de claimNumber ile tekil talep
 * çeken bir GET endpoint'i YOK — /claims/number/{claimNumber} altında yalnızca
 * accept/reject/preapprovalconfirm gibi POST aksiyon endpoint'leri var.
 * Sorgulama sadece merchant bazlı liste üzerinden mümkündür:
 *   GET {OMS}/claims/merchantId/{merchantId}                → tüm talepler
 *   GET {OMS}/claims/merchantId/{merchantId}/status/{status} → statüye göre talepler
 *
 * Optimizasyon: DB'deki mevcut claimStatus biliniyorsa önce o statüyle
 * filtrelenmiş (küçük) listede aranır — bu, tüm talepleri çekmek yerine
 * genelde tek sayfada sonuç verir. Bulunamazsa (statü HB tarafında değişmiş
 * olabilir, örn. Created → Accepted) statüsüz genel taramaya düşülür.
 */
export async function refreshHbReturnClaimInDb(params: {
  storeId: string;
  claimId: string;
  knownStatus?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const findInItems = (items: unknown[]) =>
    items
      .map((it) => asRecord(it))
      .find(
        (r) =>
          r &&
          (str(r.claimNumber) === params.claimId ||
            str(r.number) === params.claimId ||
            str(r.id) === params.claimId ||
            str(r.claimId) === params.claimId)
      );

  if (params.knownStatus) {
    const narrowed = await fetchHbReturnClaims({
      storeId: params.storeId,
      status: params.knownStatus,
      maxPages: 5
    });
    if (narrowed.ok) {
      const match = findInItems(narrowed.items);
      if (match) {
        await upsertHbReturnClaimFromRaw({ storeId: params.storeId, raw: match });
        return { ok: true };
      }
    }
    // narrowed sorgu başarısız olduysa veya statü değişmiş olabileceğinden
    // bulunamadıysa, aşağıdaki genel taramaya düşülür.
  }

  const pull = await fetchHbReturnClaims({ storeId: params.storeId, maxPages: 40 });
  if (!pull.ok) return { ok: false, message: pull.message };
  const match = findInItems(pull.items);
  if (!match) return { ok: false, message: "Hepsiburada yanıtında talep bulunamadı." };
  await upsertHbReturnClaimFromRaw({ storeId: params.storeId, raw: match });
  return { ok: true };
}

// ─── Onay / Red işlemleri ────────────────────────────────────────────

/**
 * Talebi onaylar (POST {OMS}/claims/number/{claimNumber}/accept).
 *
 * finalizedWith: "Refund" (ücret iadesi) | "Change" (yeni ürün ile değiştir).
 * Belirtilmezse "Refund" gönderilir (HB'nin kendi varsayılanıyla tutarlı —
 * dokümantasyon: "body bilgisi gönderilmez ise İade olarak onaylanmaktadır").
 * Başarılı yanıt 204 No Content'tir, gövde dönmez.
 */
export async function approveHbReturnClaim(params: {
  storeId: string;
  claimId: string;
  finalizedWith?: "Refund" | "Change";
  invoiceLink?: string;
  acceptionReason?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = `/claims/number/${encodeURIComponent(params.claimId)}/accept`;
  const body: Record<string, string> = {
    FinalizedWith: params.finalizedWith ?? "Refund"
  };
  if (params.invoiceLink) body.InvoiceLink = params.invoiceLink;
  if (params.acceptionReason) body.AcceptionReason = params.acceptionReason;

  const res = await hbPostJson(params.storeId, "OMS", path, body);
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Talebi reddeder (POST {OMS}/claims/number/{claimNumber}/reject).
 *
 * reasonCode → ClaimRejectionReason (HB'nin sabit enum listesinden, bkz.
 * fetchHbReturnReasons ve "Talep Reddetme" dokümantasyonu — Return/RenewProduct
 * ve MissingItem/MissingPart için ayrı enum kümeleri vardır).
 * description → MerchantStatement (satıcı açıklaması, serbest metin).
 * Başarılı yanıt 204 No Content'tir, gövde dönmez.
 */
export async function rejectHbReturnClaim(params: {
  storeId: string;
  claimId: string;
  reasonCode: string;
  description?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = `/claims/number/${encodeURIComponent(params.claimId)}/reject`;
  const res = await hbPostJson(params.storeId, "OMS", path, {
    ClaimRejectionReason: params.reasonCode,
    MerchantStatement: (params.description ?? "").trim().slice(0, 500) || "."
  });
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

/**
 * Talebi ön onaylar (POST {OMS}/claims/number/{claimNumber}/preapprovalconfirm).
 *
 * Yalnızca claimStatus "AwaitingPreApproval" iken anlamlıdır — HB, bazı talep
 * tiplerinde satıcının nihai onay/red vermeden önce bir "ön onay" adımı
 * bekler. Body gerektirmez, başarılı yanıt 204 No Content'tir.
 */
export async function preApproveHbReturnClaim(params: {
  storeId: string;
  claimId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const path = `/claims/number/${encodeURIComponent(params.claimId)}/preapprovalconfirm`;
  const res = await hbPostJson(params.storeId, "OMS", path, {});
  if (!res.ok) return { ok: false, message: res.message };
  return { ok: true };
}

// ─── Test talep oluşturma (CLAIM_STUB_SIT — yalnızca SIT) ─────────────────────

/**
 * Method: POST
 * Path: /claims/merchant/{merchantid}/create
 * Base: CLAIM_STUB_SIT (yalnızca SIT; prod yok)
 * SIT listesiyle doğrulandı (03.08.2026).
 *
 * Mevcut accept/reject/liste fonksiyonlarına dokunulmadı — yalnızca eksik
 * "Talep Oluşturma" stub'ı. createHbTestOrder deseniyle aynı guard.
 *
 * TODO: claimPayload şeması teyit edilmeli.
 */
export async function createHbTestClaim(params: {
  storeId: string;
  claimPayload: Record<string, unknown>;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const env = await getHbEnvironment(params.storeId);
    if (env !== "test") {
      return {
        ok: false,
        message:
          "Test talep (claim) oluşturma yalnızca SIT ortamında kullanılabilir.",
      };
    }

    const merchantId = await getHbMerchantId(params.storeId);
    // Path: /claims/merchant/{merchantid}/create — SIT listesiyle birebir.
    const path = `/claims/merchant/${encodeURIComponent(merchantId)}/create`;

    const res = await hbPostJson(
      params.storeId,
      "CLAIM_STUB_SIT",
      path,
      params.claimPayload
    );
    if (!res.ok) return { ok: false, message: res.message };

    logger.info("hb_test_claim_created", {
      storeId: params.storeId,
      merchantId,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Test talep oluşturma hatası.";
    logger.error("hb_create_test_claim_failed", { message });
    return { ok: false, message };
  }
}
