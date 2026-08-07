# Trendyol Ürün API V1 → V2 Geçişi

> Bu doküman V1→V2 geçişinin (Faz 1) ilerleyişini takip eder.
> V1 kodu silinmez; `PRODUCT_V2` feature flag arkasında kademeli geçiş.

## Path doğrulama tablosu

Kaynak: [developers.trendyol.com/reference](https://developers.trendyol.com/reference) OpenAPI tanımları.
`verifiedVia=openapi-docs` resmi referans; STAGE canlı denemesi rollout öncesi ayrıca yapılacak.

| Operasyon | Method | Path ( `/integration` sonrası ) | Doğrulama | Yöntem | Tarih |
|-----------|--------|----------------------------------|-----------|--------|-------|
| createProducts V2 | POST | `/product/sellers/{sellerId}/v2/products` | ✅ | openapi-docs | 2026-06-22 |
| updateUnapprovedProducts | POST | `/product/sellers/{sellerId}/products/unapproved-bulk-update` | ✅ | openapi-docs | 2026-06-22 |
| updateApprovedProductContent | POST | `/product/sellers/{sellerId}/products/content-bulk-update` | ✅ | openapi-docs | 2026-06-22 |
| updateApprovedProductVariant | POST | `/product/sellers/{sellerId}/products/variant-bulk-update` | ✅ | openapi-docs | 2026-06-22 |
| updateApprovedProductDelivery | POST | `/product/sellers/{sellerId}/products/delivery-info-bulk-update` | ✅ | openapi-docs | 2026-06-22 |
| updatePriceAndInventory | POST | `/inventory/sellers/{sellerId}/products/price-and-inventory` | ✅ | openapi-docs | 2026-06-22 |
| getBatchRequestResult | GET | `/product/sellers/{sellerId}/products/batch-requests/{batchRequestId}` | ✅ | openapi-docs | 2026-06-22 |
| deleteProducts V2 | DELETE | `/product/sellers/{sellerId}/products` | ✅ | openapi-docs | 2026-06-22 |
| archiveProducts V2 | PUT | `/product/sellers/{sellerId}/products/archive-state` | ✅ | openapi-docs | 2026-06-22 |
| unlockProducts | PUT | `/product/sellers/{sellerId}/products/unlock` | ✅ | openapi-docs | 2026-06-22 |
| getBuyboxInformation | POST | `/product/sellers/{sellerId}/products/buybox-information` | ✅ | openapi-docs | 2026-06-22 |
| getProductBase | GET | `/product/sellers/{sellerId}/product/{barcode}` | ✅ | openapi-docs | 2026-06-22 |
| filterApprovedProducts | GET | `/product/sellers/{sellerId}/products/approved` | ✅ | openapi-docs | 2026-06-22 |
| filterUnapprovedProducts | GET | `/product/sellers/{sellerId}/products/unapproved` | ✅ | openapi-docs | 2026-06-22 |
| getBrands | GET | `/product/brands` | ✅ | openapi-docs | 2026-06-22 |
| getCategoryTree | GET | `/product/product-categories` | ✅ | openapi-docs | 2026-06-22 |
| getCategoryAttributes | GET | `/product/categories/{categoryId}/attributes` | ✅ | openapi-docs | 2026-06-22 |
| getCategoryAttributeValues | GET | `/product/categories/{categoryId}/attributes/{attributeId}/values` | ✅ | openapi-docs | 2026-06-22 |

Kod karşılığı: `src/lib/trendyolPartnerApiV2.ts` (`V2_PATH_META`, `buildTrendyolV2Path`).

## Yapılanlar

_(Faz 1 ilerledikçe doldurulacak.)_

- [x] Görev 1: V2 path iskeleti + doğrulama tablosu
- [x] Görev 2: Referans senkronu — V2 kategori özellik/değer uçları (`getCategoryAttributes` + `getCategoryAttributeValues`); marka/kategori ağacı V1 ile aynı path
- [x] Görev 3: `approvalState` enum + `trendyolContentId` + backfill script
- [x] Görev 4: `buildTrendyolCreateProductBodyV2` + publish pipeline V2 create
- [x] Görev 5: `updateUnapprovedProducts` — onaysız içerik güncelleme yolu
- [x] Görev 6: `updateApprovedProductContent` + onaylı ürün UI kilidi
- [x] Görev 7: V2 varyant/teslimat API (`trendyolProductApiV2.ts`)
- [x] Görev 8: `useProductV2Filter` bağlantı testine (`/api/integrations/trendyol/test-connection`) bağlandı — mağazanın `PRODUCT_V2` flag'i açıksa test isteği `filterApprovedProducts` (V2), kapalıysa `filterProducts` (V1) ile atılır; yanıt `apiVersion` alanı ve UI'da (`settings/trendyol`) test mesajı sonuna eklenen "(V1/V2 uç noktası)" etiketiyle görünür kılındı
- [x] Görev 9: Arşiv/silme V2 path yönlendirmesi
- [x] Görev 10: `unlockTrendyolProduct()` backend
- [x] Görev 11: TR `vatRate` enum (`trendyolVatRate.ts` + prePublish)
- [x] Görev 12: Admin system-status PRODUCT_V2 rollout özeti

## Geri Alma Adımları

1. Etkilenen mağazalarda `Store.featureFlags.product_v2_enabled` → `false` (veya flag anahtarını kaldır).
2. Flag kapalıyken tüm publish/update/filter akışları otomatik V1 path'lerine döner.
3. `approvalState` migration additive'dir; geri almak için migration resolve veya kolon bırakılır (veri kaybı yok).
4. Ciddi sorun: `git checkout pre-faz0-baseline` veya ilgili faz commit'lerini revert.
