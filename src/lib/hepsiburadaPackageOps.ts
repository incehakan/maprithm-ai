/**

 * Hepsiburada paket / kalem operasyonları (OMS).

 *

 * Path'ler SIT listesiyle doğrulandı (03.08.2026).

 * Body şemaları: developers.hepsiburada.com OpenAPI / reference türevinden

 * (Lonca SDK `orders.*` tipleri + README örnekleri) doğrulandı (2026-08-03).

 * Doğrudan `llms.txt` / reference HTML Akamai 403 nedeniyle okunamadı;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 *

 * packageNumber parametresi her zaman extractHbPackageNumber() ile DB

 * kaydından çıkarılmalı (guid değil, gerçek HB packageNumber).

 */



import { getHbMerchantId, hbFetch, hbPostJson, hbPutJson } from "@/lib/hepsiburadaFetch";

import { logger } from "@/lib/logger";



type HbSimpleResult =

  | { ok: true; data: unknown }

  | { ok: false; message: string };



/**

 * PUT parcel-info body.

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export type HbParcelInfoBody = {

  desi?: number;

  width?: number;

  height?: number;

  length?: number;

  weight?: number;

};



/**

 * PUT warehouse body.

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export type HbWarehouseBody = {

  warehouseId: string;

};



/**

 * POST split body.

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export type HbSplitPackageBody = {

  /** Yeni pakete taşınacak sipariş kalemi id listesi. */

  lineItems: string[];

};



/**

 * PUT laborcost body.

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 *

 * Kısıt: yalnızca ALTIN ürün kalemleri için geçerli (HB dokümanı).

 */

export type HbLaborCostBody = {

  laborCost: number;

};



/**

 * Method: PUT

 * Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/parcel-info

 * Body: `{ desi?, width?, height?, length?, weight? }`

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function updateHbParcelInfo(params: {

  storeId: string;

  packageNumber: string;

  body: HbParcelInfoBody;

}): Promise<HbSimpleResult> {

  try {

    const merchantId = await getHbMerchantId(params.storeId);

    const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/parcel-info`;

    const res = await hbPutJson(params.storeId, "OMS", path, params.body);

    if (!res.ok) {

      if (res.status === 405) {

        logger.warn("hb_parcel_info_method_405", {

          note: "PUT 405 — POST denenmeli (method çıkarımı).",

        });

      }

      return { ok: false, message: res.message };

    }

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "parcel-info hatası.";

    logger.error("hb_update_parcel_info_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: PUT

 * Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/warehouse

 * Body: `{ warehouseId }`

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function updateHbPackageWarehouse(params: {

  storeId: string;

  packageNumber: string;

  body: HbWarehouseBody;

}): Promise<HbSimpleResult> {

  try {

    const merchantId = await getHbMerchantId(params.storeId);

    const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/warehouse`;

    const res = await hbPutJson(params.storeId, "OMS", path, params.body);

    if (!res.ok) {

      if (res.status === 405) {

        logger.warn("hb_warehouse_method_405", {

          note: "PUT 405 — POST denenmeli (method çıkarımı).",

        });

      }

      return { ok: false, message: res.message };

    }

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "warehouse hatası.";

    logger.error("hb_update_warehouse_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: POST

 * Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/split

 * Body: `{ lineItems: string[] }`

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function splitHbPackage(params: {

  storeId: string;

  packageNumber: string;

  body: HbSplitPackageBody;

}): Promise<HbSimpleResult> {

  try {

    const merchantId = await getHbMerchantId(params.storeId);

    const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/split`;

    const res = await hbPostJson(params.storeId, "OMS", path, params.body);

    if (!res.ok) {

      if (res.status === 405) {

        logger.warn("hb_split_method_405", {

          note: "POST 405 — PUT denenmeli (method çıkarımı).",

        });

      }

      return { ok: false, message: res.message };

    }

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "split hatası.";

    logger.error("hb_split_package_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: GET

 * Path: /packages/merchantid/{merchantId}

 * SIT listesiyle doğrulandı (03.08.2026) — genel paket listesi (filtresiz).

 * Opsiyonel offset/limit query (pagination varsayımı; param adları teyit bekliyor).

 */

export async function listHbPackages(params: {

  storeId: string;

  offset?: number;

  limit?: number;

}): Promise<HbSimpleResult> {

  try {

    const merchantId = await getHbMerchantId(params.storeId);

    const qs = new URLSearchParams();

    if (params.offset != null) qs.set("offset", String(params.offset));

    if (params.limit != null) qs.set("limit", String(params.limit));

    const q = qs.toString();

    const path = `/packages/merchantid/${encodeURIComponent(merchantId)}${q ? `?${q}` : ""}`;

    const res = await hbFetch(params.storeId, "OMS", path);

    if (!res.ok) return { ok: false, message: res.message };

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "list packages hatası.";

    logger.error("hb_list_packages_failed", { message });

    return { ok: false, message };

  }

}



/**

 * Method: PUT

 * Path: /lineitems/merchantid/{merchantId}/orderlineid/{id}/laborcost

 * Body: `{ laborCost: number }`

 *

 * Kısıt: dokümana göre yalnızca ALTIN ürün kalemleri için geçerlidir —

 * diğer kategorilerde çağrı beklenen şekilde reddedilir / anlamsızdır.

 *

 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;

 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.

 */

export async function updateHbLineItemLaborCost(params: {

  storeId: string;

  orderLineId: string;

  body: HbLaborCostBody;

}): Promise<HbSimpleResult> {

  try {

    const orderLineId = params.orderLineId.trim();

    if (!orderLineId) return { ok: false, message: "orderLineId zorunludur." };

    if (

      typeof params.body.laborCost !== "number" ||

      !Number.isFinite(params.body.laborCost)

    ) {

      return { ok: false, message: "laborCost sayısal olmalıdır." };

    }

    const merchantId = await getHbMerchantId(params.storeId);

    const path = `/lineitems/merchantid/${encodeURIComponent(merchantId)}/orderlineid/${encodeURIComponent(orderLineId)}/laborcost`;

    const res = await hbPutJson(params.storeId, "OMS", path, {

      laborCost: params.body.laborCost,

    });

    if (!res.ok) {

      if (res.status === 405) {

        logger.warn("hb_laborcost_method_405", {

          note: "PUT 405 — POST denenmeli (method çıkarımı).",

        });

      }

      return { ok: false, message: res.message };

    }

    return { ok: true, data: res.data };

  } catch (err) {

    const message = err instanceof Error ? err.message : "laborcost hatası.";

    logger.error("hb_update_laborcost_failed", { message });

    return { ok: false, message };

  }

}


