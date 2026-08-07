/**
 * Hepsiburada Kargo / Shipping Profiles (SHIPPING base).
 *
 * Mevcut `hepsiburadaShipping.ts` (OMS — etiket/labels) ile KARISTIRMA.
 * Bu dosya shipping-external altında kargo firması listesi ve profil yönetir.
 *
 * SIT listesiyle doğrulandı (03.08.2026).
 * Prod domain TAHMİNİ (`SHIPPING` — `-sit` kaldırıldı); ilk prod çağrıda teyit.
 */

import { getHbMerchantId, hbFetch, hbPostJson } from "@/lib/hepsiburadaFetch";
import { logger } from "@/lib/logger";

type HbSimpleResult =
  | { ok: true; data: unknown }
  | { ok: false; message: string };

/**
 * Method: GET
 * Path: /cargoFirms/{merchantId}
 * SIT listesiyle doğrulandı (03.08.2026). Base: SHIPPING.
 */
export async function fetchHbCargoFirms(params: {
  storeId: string;
}): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/cargoFirms/${encodeURIComponent(merchantId)}`;
    const res = await hbFetch(params.storeId, "SHIPPING", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "cargoFirms hatası.";
    logger.error("hb_fetch_cargo_firms_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: GET
 * Path: /profiles/{merchantId}
 * SIT listesiyle doğrulandı (03.08.2026). Base: SHIPPING.
 */
export async function fetchHbShippingProfiles(params: {
  storeId: string;
}): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    const path = `/profiles/${encodeURIComponent(merchantId)}`;
    const res = await hbFetch(params.storeId, "SHIPPING", path);
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "profiles list hatası.";
    logger.error("hb_fetch_shipping_profiles_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /profile/createByMerchantId
 * SIT listesiyle doğrulandı (03.08.2026). Path'te merchantId YOK —
 * body'ye `merchantId` eklenir. Tam alan adları TODO: HB dokümantasyonundan teyit.
 */
export async function createHbShippingProfile(params: {
  storeId: string;
  payload: Record<string, unknown>;
}): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    // TODO: body alan şeması teyit edilmeli — merchantId body'de varsayıldı.
    const body = { merchantId, ...params.payload };
    const res = await hbPostJson(
      params.storeId,
      "SHIPPING",
      "/profile/createByMerchantId",
      body
    );
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "profile create hatası.";
    logger.error("hb_create_shipping_profile_failed", { message });
    return { ok: false, message };
  }
}

/**
 * Method: POST
 * Path: /profile/updateByMerchantId
 * SIT listesiyle doğrulandı (03.08.2026). Path'te merchantId YOK —
 * body'ye `merchantId` eklenir. TODO: alan şeması teyit.
 */
export async function updateHbShippingProfile(params: {
  storeId: string;
  payload: Record<string, unknown>;
}): Promise<HbSimpleResult> {
  try {
    const merchantId = await getHbMerchantId(params.storeId);
    // TODO: body alan şeması teyit edilmeli — merchantId body'de varsayıldı.
    const body = { merchantId, ...params.payload };
    const res = await hbPostJson(
      params.storeId,
      "SHIPPING",
      "/profile/updateByMerchantId",
      body
    );
    if (!res.ok) return { ok: false, message: res.message };
    return { ok: true, data: res.data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "profile update hatası.";
    logger.error("hb_update_shipping_profile_failed", { message });
    return { ok: false, message };
  }
}
