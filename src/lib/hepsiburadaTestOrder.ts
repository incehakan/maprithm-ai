/**
 * Hepsiburada SIT stub — test siparişi oluşturma.
 *
 * Method: POST
 * Path: /orders/merchantId/{merchantId}
 *   (dikkat: segment `merchantId` — diğer OMS path'lerindeki `merchantid`'den
 *   farklı casing; olduğu gibi korunur)
 * Base: HB_BASE.OMS_STUB_SIT (yalnızca SIT; prod karşılığı yok)
 * SIT listesiyle doğrulandı (03.08.2026).
 *
 * Production ortamında çağrı açık hata döner.
 *
 * TODO: body şeması teyit edilmeli — dokümantasyon örnek payload bulunamadı;
 * minimal iskelet bırakıldı.
 */

import {
  getHbEnvironment,
  getHbMerchantId,
  hbPostJson,
} from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

/**
 * Minimal test siparişi iskeleti — alan adları tahmini.
 * TODO: body şeması teyit edilmeli (HB SIT Try It! / doküman örneği).
 */
export type HbTestOrderPayload = Record<string, unknown>;

/**
 * Method: POST
 * Path: /orders/merchantId/{merchantId}  (OMS_STUB_SIT)
 * SIT listesiyle doğrulandı (03.08.2026).
 */
export async function createHbTestOrder(params: {
  storeId: string;
  orderPayload: HbTestOrderPayload;
}): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const env = await getHbEnvironment(params.storeId);
    if (env !== "test") {
      return {
        ok: false,
        message:
          "Test siparişi oluşturma yalnızca SIT ortamında kullanılabilir.",
      };
    }

    const merchantId = await getHbMerchantId(params.storeId);
    // Path segment casing: merchantId (büyük I) — SIT listesiyle birebir.
    const path = `/orders/merchantId/${encodeURIComponent(merchantId)}`;

    const res = await hbPostJson(
      params.storeId,
      "OMS_STUB_SIT",
      path,
      params.orderPayload
    );
    if (!res.ok) return { ok: false, message: res.message };

    logger.info("hb_test_order_created", {
      storeId: params.storeId,
      merchantId,
    });
    return { ok: true, data: res.data };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Test siparişi oluşturma hatası.";
    logger.error("hb_create_test_order_failed", { message });
    return { ok: false, message };
  }
}
