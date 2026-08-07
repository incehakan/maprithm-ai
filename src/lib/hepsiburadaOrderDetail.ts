/**
 * Hepsiburada sipariş / paket detay okuma (OMS).
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 *
 * `fetchHbPackageDetail` hem "Paket İçin Kargo Bilgilerini Listeleme" hem
 * "Paket Süreçleri" bölümünde aynı URL ile geçiyor — tek fonksiyon yeterli.
 */

import { getHbMerchantId, hbFetch } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbSimpleResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * Method: GET
 * Path: /orders/merchantid/{merchantId}/ordernumber/{orderNumber}
 * SIT listesiyle doğrulandı (03.08.2026).
 */
export async function fetchHbOrderDetail(params: {
  storeId: string;
  orderNumber: string;
}): Promise<HbSimpleResult> {
  try {
    const orderNumber = params.orderNumber.trim();
    if (!orderNumber) return { ok: false, message: "orderNumber zorunludur." };
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/orders/merchantid/${encodeURIComponent(merchantId)}/ordernumber/${encodeURIComponent(orderNumber)}`;
    const res = await hbFetch(params.storeId, "OMS", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "order detail hatası.";
    logger.error("hb_fetch_order_detail_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: GET
 * Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}
 * SIT listesiyle doğrulandı (03.08.2026).
 * Kargo bilgisi + paket süreçleri aynı path — tek fonksiyon.
 * packageNumber: extractHbPackageNumber() ile alınmalı.
 */
export async function fetchHbPackageDetail(params: {
  storeId: string;
  packageNumber: string;
}): Promise<HbSimpleResult> {
  try {
    const packageNumber = params.packageNumber.trim();
    if (!packageNumber) return { ok: false, message: "packageNumber zorunludur." };
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(packageNumber)}`;
    const res = await hbFetch(params.storeId, "OMS", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "package detail hatası.";
    logger.error("hb_fetch_package_detail_failed", { message });
    return { ok: false, message };
  }
}
