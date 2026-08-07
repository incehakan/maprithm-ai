/**
 * Hepsiburada Ürün Güncelleme (ticket-api) grubu.
 *
 * Doğrulama durumu: PLACEHOLDER — developers.hepsiburada.com > Ürün Yönetimi >
 * Ürün Güncelleme sayfalarından yalnızca path biliniyor; request/response
 * şeması okunmadı. Auth varsayımı: diğer MPOP servisleriyle tutarlı Basic
 * (doğrulanmadı — implementasyonda not).
 *
 * Path'ler (mpop[-sit].hepsiburada.com):
 *  - POST /ticket-api/api/integrator/import
 *  - GET  /ticket-api/api/integrator/merchant/{merchantId}/hbSku/{hbSku}
 *  - GET  /ticket-api/api/integrator/status/{trackingId}
 */

import type { HbFetchResult } from "@/lib/hepsiburadaFetch";

export async function importHbProductUpdate(
  _storeId: string,
  _body: unknown
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: ticket-api/integrator/* endpoint'leri için hiç doküman " +
      "içeriği okunmadı, sadece path biliniyor. İmplemente etmeden önce " +
      "developers.hepsiburada.com > Ürün Yönetimi > Ürün Güncelleme " +
      "referans sayfaları tek tek okunmalı."
  );
}

export async function getHbProductUpdateByHbSku(
  _storeId: string,
  _merchantId: string,
  _hbSku: string
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: ticket-api/integrator/* endpoint'leri için hiç doküman " +
      "içeriği okunmadı, sadece path biliniyor. İmplemente etmeden önce " +
      "developers.hepsiburada.com > Ürün Yönetimi > Ürün Güncelleme " +
      "referans sayfaları tek tek okunmalı."
  );
}

export async function getHbProductUpdateStatus(
  _storeId: string,
  _trackingId: string
): Promise<HbFetchResult<unknown>> {
  throw new Error(
    "HB_UNVERIFIED: ticket-api/integrator/* endpoint'leri için hiç doküman " +
      "içeriği okunmadı, sadece path biliniyor. İmplemente etmeden önce " +
      "developers.hepsiburada.com > Ürün Yönetimi > Ürün Güncelleme " +
      "referans sayfaları tek tek okunmalı."
  );
}
