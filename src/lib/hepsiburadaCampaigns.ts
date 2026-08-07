/**
 * Hepsiburada Self-Campaign (Diskonto) — satıcı kampanya / indirim oluşturma.
 *
 * Base: HB_BASE.DISKONTO / DISKONTO_SIT
 *
 * AUTH NOTU (KRİTİK): Okunan 3 guide sayfasında (TL / Yüzde / XY indirim)
 * "API, HTTP Basic Auth ile korunmaktadır" ibaresi tekrarlanmadı. Diğer
 * HB modüllerinde bu ibare standarttı. Bu modülde auth yöntemi sayfa
 * içeriğinde DOĞRULANAMADI; platform tutarlılığı varsayımıyla Basic Auth
 * (`authMode: "basic"`, hbPostJson/hbFetch varsayılanı) kullanıldı.
 * İlk gerçek istekte 401 alınırsa bu not ilk bakılacak yerdir.
 *
 * Tarih davranışı (tüm create endpoint'leri):
 * - startDate bugünse: gönderilen saatten bağımsız, şu andan 1 saat sonra başlar.
 * - startDate ileri tarihse: gönderilen saatten bağımsız, o gün 00:00'da başlar.
 * - endDate: gönderilen saatten bağımsız, o gün 23:59'da biter.
 * UI'da saat seçimi anlamsızdır — yalnızca tarih yeterlidir.
 *
 * Para tutarları: JSON number (ondalık nokta). Katalog import'taki virgüllü
 * string `formatHbPrice` formatı BURADA KULLANILMAZ.
 */

import {
  getHbMerchantId,
  hbFetch,
  hbPostJson,
  type HbFetchResult,
} from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

/** Dokümantasyon notu — tip olarak kullanılmaz, davranış JSDoc'ta. */
export type HbSelfCampaignDateNote = {
  // startDate bugünse: gönderilen saatten bağımsız, şu andan 1 saat sonra başlar.
  // startDate ileri tarihse: gönderilen saatten bağımsız, o gün 00:00'da başlar.
  // endDate: gönderilen saatten bağımsız, o gün 23:59'da biter.
};

export type HbTlDiscountRequest = {
  name: string;
  startDate: string;
  endDate: string;
  conditionCategories?: string[];
  conditionSkus?: string[];
  budget: number;
  discountAmount: number;
  conditionAmount: number;
  oneTimeUsage: boolean;
};

export type HbPercentDiscountRequest = {
  name: string;
  startDate: string;
  endDate: string;
  conditionCategories?: string[];
  conditionSkus?: string[];
  discountPercentage: number;
  conditionAmount: number;
  maxDiscountAmount: number;
  maxCartCount: number;
  oneTimeUsage: boolean;
};

export type HbXyDiscountRequest = {
  name: string;
  startDate: string;
  endDate: string;
  conditionCategories?: string[];
  conditionSkus?: string[];
  conditionProductCount: number;
  mustPayProductCount: number;
  /** Dokümanda büyük harf I — JSON alan adı birebir `IterationCount`. */
  IterationCount: number;
  maxCartCount: number;
  oneTimeUsage: boolean;
};

function warnIfNoConditions(
  kind: string,
  body: { conditionCategories?: string[]; conditionSkus?: string[] }
): void {
  const cats = body.conditionCategories?.filter((c) => c?.trim()) ?? [];
  const skus = body.conditionSkus?.filter((s) => s?.trim()) ?? [];
  if (cats.length === 0 && skus.length === 0) {
    logger.warn("hb_campaign_missing_conditions", {
      kind,
      note:
        "conditionCategories ve conditionSkus ikisi de boş — API validasyonuna güveniliyor.",
    });
  }
}

function campaignPath(merchantId: string, suffix: string): string {
  return `/self-campaign/${encodeURIComponent(merchantId)}${suffix}`;
}

/**
 * POST /self-campaign/{merchantId}/tl-discount
 *
 * Tarih: startDate bugün → +1 saat; ileri tarih → o gün 00:00; endDate → 23:59
 * (gönderilen saat yok sayılır). Response şeması belgelenmedi → unknown.
 */
export async function createHbTlDiscount(
  storeId: string,
  body: HbTlDiscountRequest
): Promise<HbFetchResult<unknown>> {
  warnIfNoConditions("tl-discount", body);
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbPostJson(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/tl-discount"),
    body
  );
  if (res.ok) {
    logger.info("hb_campaign_tl_discount_created", { storeId, data: res.data });
  }
  return res;
}

/**
 * POST /self-campaign/{merchantId}/percent-discount
 *
 * Tarih davranışı tl-discount ile aynı (saat yok sayılır). Response → unknown.
 */
export async function createHbPercentDiscount(
  storeId: string,
  body: HbPercentDiscountRequest
): Promise<HbFetchResult<unknown>> {
  warnIfNoConditions("percent-discount", body);
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbPostJson(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/percent-discount"),
    body
  );
  if (res.ok) {
    logger.info("hb_campaign_percent_discount_created", {
      storeId,
      data: res.data,
    });
  }
  return res;
}

/**
 * POST /self-campaign/{merchantId}/xy-discount
 *
 * Tarih davranışı tl-discount ile aynı.
 * `IterationCount` alan adı dokümanda büyük I ile — birebir gönderilir.
 * 400/422 alınırsa ilk şüphe: bu casing tutarsızlığı.
 * Response → unknown.
 */
export async function createHbXyDiscount(
  storeId: string,
  body: HbXyDiscountRequest
): Promise<HbFetchResult<unknown>> {
  warnIfNoConditions("xy-discount", body);
  const merchantId = await getHbMerchantId(storeId);
  // IterationCount'u açıkça koru (camelCase'e çevirme).
  const payload = {
    name: body.name,
    startDate: body.startDate,
    endDate: body.endDate,
    conditionCategories: body.conditionCategories,
    conditionSkus: body.conditionSkus,
    conditionProductCount: body.conditionProductCount,
    mustPayProductCount: body.mustPayProductCount,
    IterationCount: body.IterationCount,
    maxCartCount: body.maxCartCount,
    oneTimeUsage: body.oneTimeUsage,
  };
  const res = await hbPostJson(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/xy-discount"),
    payload
  );
  if (res.ok) {
    logger.info("hb_campaign_xy_discount_created", { storeId, data: res.data });
  }
  return res;
}

/**
 * GET /self-campaign/{merchantId}/categories
 * Şema doğrulanamadı — GET istisnası, data: unknown + log.
 * Katalog kategori listesinden farklı olabilir; CategoryPicker varsayma.
 */
export async function getHbCampaignEligibleCategories(
  storeId: string
): Promise<HbFetchResult<unknown>> {
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbFetch(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/categories")
  );
  if (res.ok) {
    logger.info("hb_campaign_categories_response", { storeId, data: res.data });
  }
  return res;
}

/**
 * GET /self-campaign/{merchantId}/budgets — şema yok, unknown + log.
 */
export async function getHbCampaignBudgets(
  storeId: string
): Promise<HbFetchResult<unknown>> {
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbFetch(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/budgets")
  );
  if (res.ok) {
    logger.info("hb_campaign_budgets_response", { storeId, data: res.data });
  }
  return res;
}

/**
 * GET /self-campaign/{merchantId}/limits — şema yok, unknown + log.
 */
export async function getHbCampaignLimits(
  storeId: string
): Promise<HbFetchResult<unknown>> {
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbFetch(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/limits")
  );
  if (res.ok) {
    logger.info("hb_campaign_limits_response", { storeId, data: res.data });
  }
  return res;
}

/**
 * GET /self-campaign/{merchantId}/discounts — şema yok, unknown + log.
 */
export async function getHbCampaignDiscounts(
  storeId: string
): Promise<HbFetchResult<unknown>> {
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbFetch(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, "/discounts")
  );
  if (res.ok) {
    logger.info("hb_campaign_discounts_response", { storeId, data: res.data });
  }
  return res;
}

/**
 * GET /self-campaign/{merchantId}/discount/{campaignId} — şema yok, unknown + log.
 */
export async function getHbCampaignDiscountById(
  storeId: string,
  campaignId: string
): Promise<HbFetchResult<unknown>> {
  const id = campaignId.trim();
  if (!id) {
    return { ok: false, status: 400, message: "campaignId zorunludur." };
  }
  const merchantId = await getHbMerchantId(storeId);
  const res = await hbFetch(
    storeId,
    "DISKONTO",
    campaignPath(merchantId, `/discount/${encodeURIComponent(id)}`)
  );
  if (res.ok) {
    logger.info("hb_campaign_discount_by_id_response", {
      storeId,
      campaignId: id,
      data: res.data,
    });
  }
  return res;
}

/**
 * POST /self-campaign/{merchantId}/cancel-discount
 * Request body şeması doğrulanamadı — yazma işlemi, implement edilmedi.
 */
export async function cancelHbCampaignDiscount(): Promise<never> {
  throw new Error(
    "HB_UNVERIFIED: cancel-discount request body şeması doğrulanamadı " +
      "(muhtemelen { campaignId } ama teyit edilmedi). Yanlış kampanyanın " +
      "iptal edilmesi riskine karşı implement edilmedi. Önce " +
      "developers.hepsiburada.com'da bu endpoint için ayrı bir referans " +
      "sayfası aranmalı."
  );
}
