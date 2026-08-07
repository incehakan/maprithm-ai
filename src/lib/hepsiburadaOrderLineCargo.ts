/**
 * Hepsiburada sipariş kalemi seviyesinde kargo firması işlemleri (OMS).
 *
 * Paket seviyesindeki `changablecargocompanies` / `changecargocompany`
 * (hepsiburadaOrderActions.ts) ile KARISTIRMA:
 *
 * - Bu dosya: paketlemeden ÖNCE, orderlineid bazlı kargo seçimi/değişimi.
 * - OrderActions: paket oluştuktan SONRA, packagenumber bazlı değiştirme.
 *
 * TODO: HB destek ile teyit edilmeli — hangi sipariş durumunda hangisi
 * kullanılmalı (Open kalem vs paket Open/Package) kesin değil.
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 */

import { getHbMerchantId, hbFetch, hbPutJson } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbSimpleResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * Method: GET
 * Path: /delivery/changeablecargocompanies/merchantid/{merchantId}/orderlineid/{orderLineId}
 * SIT listesiyle doğrulandı (03.08.2026).
 *
 * Fark (paket GET'inden): kalem henüz paketlenmeden değiştirilebilir
 * kargo firmalarını listeler. Paket oluştuktan sonra
 * `fetchHbChangeableCargoCompanies` kullanılmalı.
 * TODO: HB destek ile teyit edilmeli.
 */
export async function fetchHbChangeableCargoCompaniesByOrderLine(params: {
  storeId: string;
  orderLineId: string;
}): Promise<HbSimpleResult> {
  try {
    const orderLineId = params.orderLineId.trim();
    if (!orderLineId) return { ok: false, message: "orderLineId zorunludur." };
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/delivery/changeablecargocompanies/merchantid/${encodeURIComponent(merchantId)}/orderlineid/${encodeURIComponent(orderLineId)}`;
    const res = await hbFetch(params.storeId, "OMS", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "orderline cargo list hatası.";
    logger.error("hb_orderline_changeable_cargo_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: PUT
 * Path: /lineitems/merchantid/{merchantId}/orderlineid/{id}/cargocompany
 * Body: `{ cargoCompany: string }` — değer GET ShortName/code.
 *
 * Resmi dokümantasyondan doğrulandı (2026-08-03) — path/body;
 * canlı SIT testiyle henüz TEYİT EDİLMEDİ.
 * Paket seviyesindeki `changeHbPackageCargoCompany` ile karıştırma.
 */
export async function changeHbOrderLineCargoCompany(params: {
  storeId: string;
  orderLineId: string;
  cargoCompanyShortName: string;
}): Promise<HbSimpleResult> {
  try {
    const orderLineId = params.orderLineId.trim();
    const shortName = params.cargoCompanyShortName.trim();
    if (!orderLineId) return { ok: false, message: "orderLineId zorunludur." };
    if (!shortName) return { ok: false, message: "cargoCompanyShortName zorunludur." };

    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/lineitems/merchantid/${encodeURIComponent(merchantId)}/orderlineid/${encodeURIComponent(orderLineId)}/cargocompany`;
    const res = await hbPutJson(params.storeId, "OMS", path, {
      cargoCompany: shortName,
    });
    if (!res.ok) {
      if (res.status === 405) {
        logger.warn("hb_orderline_cargocompany_method_405", {
          note: "PUT 405 — POST denenmeli (method çıkarımı).",
        });
      }
      return { ok: false, message: res.message };
    }
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "orderline cargo change hatası.";
    logger.error("hb_orderline_change_cargo_failed", { message });
    return { ok: false, message };
  }
}
