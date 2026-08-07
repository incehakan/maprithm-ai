# GÖREV: Hepsiburada — Kargo, Muhasebe, Satıcıya Sor, Talep, Tedarikçi Entegrasyonları

## Bağlam

Önceki oturumda `docs/HEPSIBURADA_OMS_TAMAMLAMA_PROMPT.md` ile OMS (sipariş/
paket) tarafı tamamlandı. Bu görev, **5 farklı yeni HB servisini** (her biri
FARKLI bir base domain) kapsıyor. Aşağıdaki URL'ler developers.hepsiburada.com
SIT (test) ortamından doğrulanmıştır.

Kurallar `.cursorrules` ile aynı: TypeScript strict, `hbFetch`/`hbPostJson`/
`hbPutJson`/`hbDelete` katmanını kullan, yeni bir HTTP client icat etme,
Türkçe JSDoc ile kaynağı ve doğrulama tarihini belirt.

**ÖNEMLİ — önce `hepsiburadaReturns.ts`'i kontrol et:** "Talep Entegrasyonu"
bölümündeki accept/reject/preapprovalconfirm/listing endpoint'leri ORADA
ZATEN doğru şekilde implement edilmiş (bu görevdeki liste ile birebir
eşleşiyor). Onlara DOKUNMA — yalnızca "Talep Oluşturma" (madde 4) eksik.

---

## 1) HB_BASE'e 5 yeni anahtar ekle (`hepsiburadaFetch.ts`)

```ts
// HB_BASE objesine ekle:
SHIPPING_SIT: "https://shipping-external-sit.hepsiburada.com",
SHIPPING: "https://shipping-external.hepsiburada.com", // prod domain adı TAHMİNİ — teyit edilmeli, "-sit" kaldırılarak türetildi
MPFINANCE_SIT: "https://mpfinance-external-sit.hepsiburada.com",
MPFINANCE: "https://mpfinance-external.hepsiburada.com", // TAHMİNİ, aynı not
ASKTOSELLER_SIT: "https://api-asktoseller-merchant-sit.hepsiburada.com",
ASKTOSELLER: "https://api-asktoseller-merchant.hepsiburada.com", // TAHMİNİ
SUPPLIER_SIT: "https://supplier-api-external-sit.hepsiburada.com",
SUPPLIER: "https://supplier-api-external.hepsiburada.com", // TAHMİNİ
```

```ts
// Claim stub — yalnızca SIT, test talebi oluşturma (OMS_STUB_SIT ile aynı desen):
CLAIM_STUB_SIT: "https://claim-stub-external-sit.hepsiburada.com",
```

`hbBaseUrl()` fonksiyonunda `sitMap`'e SHIPPING/MPFINANCE/ASKTOSELLER/SUPPLIER
eşlemelerini ekle (environment === "test" iken `_SIT` suffix'li olana döner).
`CLAIM_STUB_SIT` için `OMS_STUB_SIT`'teki gibi ayrı bir guard ekle: yalnızca
`environment === "test"` iken kullanılabilir, aksi halde açık hata fırlat.

**Prod domain adları için önemli uyarı:** Kullanıcının verdiği liste yalnızca
SIT URL'lerini içeriyor. Prod domain adları (`-sit` son eki kaldırılarak)
TAHMİNİ türetildi — HB'nin bazı servislerinde SIT/prod domain isimlendirmesi
birebir simetrik olmayabilir (örn. OMS'de `oms-external-sit` → `oms-external`
simetrik ama her serviste bu garanti değil). Her yeni base key'in yanına
`// TAHMİNİ — prod'da ilk çağrıdan önce HB dokümantasyonundan teyit edilmeli`
yorumu ekle ve mümkünse `hbBaseUrl()` içinde prod + bu key kombinasyonu
kullanılmadan önce bir `logger.warn("hb_unverified_prod_domain", { baseKey })`
çağrısı ekle (üretimde sessizce yanlış domain'e istek atmayı fark edilir kıl).

---

## 2) Yeni dosya: `src/lib/hepsiburadaCargoProfiles.ts` — Kargo ve Shipping

Not: Bu, mevcut `hepsiburadaShipping.ts` (etiket/label, OMS base) ile
**farklı bir servis** — SHIPPING base'i altında kargo firması listesi ve
"kargo profili" (adres/depo bazlı kargo ayarı) yönetimi. Dosyaları karıştırma.

| Fonksiyon | Method | Path |
|---|---|---|
| `fetchHbCargoFirms` (kargo firmaları listesi) | GET | `/cargoFirms/{merchantId}` |
| `fetchHbShippingProfiles` (kargo profilleri listesi) | GET | `/profiles/{merchantId}` |
| `createHbShippingProfile` (kargo profili oluştur) | POST | `/profile/createByMerchantId` |
| `updateHbShippingProfile` (kargo profili güncelle) | POST | `/profile/updateByMerchantId` |

Base key: `SHIPPING` (yeni eklenen). `createHbShippingProfile` /
`updateHbShippingProfile` path'lerinde `{merchantId}` YOK — muhtemelen
`merchantId` body içinde gönderiliyor; bu iki fonksiyonda `merchantId`'yi
`getHbMerchantId()` ile çekip body'ye ekle (`{ merchantId, ...payload }`),
tam alan adları HB dokümantasyonundan teyit edilmeli, TODO notu bırak.

Dönüş tipi: mevcut desenle aynı — `{ ok: true; data: unknown } | { ok: false; message: string }`.

---

## 3) Yeni dosya: `src/lib/hepsiburadaFinance.ts` — Muhasebe Entegrasyonu

Base key: `MPFINANCE` (yeni eklenen). İki ayrı alt servis:

| Fonksiyon | Method | Path | Amaç |
|---|---|---|---|
| `fetchHbFinanceTransactions` (kayıt bazlı muhasebe) | GET | `/transactions/merchantid/{merchantId}` | Muhasebe hareketleri (komisyon, kesinti vb.) |
| `fetchHbPerformanceOrders` (performans servisi) | GET | `/orders/merchantid/{merchantId}` | Satıcı performans metriklerine giren sipariş verisi |

İkisi de muhtemelen sayfalama (`offset`/`limit`) ve tarih aralığı
(`startDate`/`endDate`) query param'ı destekliyor — mevcut
`fetchHbPackagesPage` (`hepsiburadaOrderSync.ts`) veya `fetchHbReturnClaims`
(`hepsiburadaReturns.ts`) içindeki sayfalama desenini birebir kopyala
(`while (page < maxPages)` döngüsü, `URLSearchParams`).

Not: `trendyolFinanceChe.ts` dosyasındaki genel yapıyı (muhasebe kaydı
normalize edip DB'ye yazma) referans al ama Prisma modeli farklı olabilir —
önce `prisma/schema.prisma`'da HB'ye özel bir finans/muhasebe modeli olup
olmadığını kontrol et; yoksa yalnızca fetch fonksiyonlarını yaz, DB upsert'i
bu görevin kapsamı dışında bırak (TODO notu yeter).

---

## 4) Yeni dosya: `src/lib/hepsiburadaAskToSeller.ts` — Satıcıya Sor Entegrasyonu

Base key: `ASKTOSELLER` (yeni eklenen). Path'lerin hepsi `/api/v1.0/issues`
altında — bu servis muhtemelen Basic Auth DIŞINDA bir kimlik doğrulama
kullanıyor olabilir (farklı domain ailesi, `api-` önekli); ilk gerçek
çağrıda 401 alınırsa `hbFetch` çağrısına `authMode` yerine bu servise özel
bir header gerekip gerekmediği araştırılmalı — şimdilik mevcut Basic Auth
katmanını dene, TODO notu bırak.

| Fonksiyon | Method | Path | Amaç |
|---|---|---|---|
| `fetchHbAskToSellerIssues` (soru listesi) | GET | `/api/v1.0/issues` | Müşteri sorularını listele |
| `createHbAskToSellerAnswer` — DİKKAT, aşağıya bak | POST | `/api/v1.0/issues` | Aynı path GET listesiyle aynı — muhtemelen bu POST farklı bir amaç için (örn. toplu senkron tetikleme) OLABİLİR; kullanıcının listesinde bu URL 2 kez tekrarlanmış (GET + POST). Path aynı olduğu için hangi işlevi yaptığı HB dokümantasyonundan teyit edilmeli — TODO notuyla POST fonksiyonunu iskelet olarak bırak, gövdesini çağırmadan önce doğrula. |
| `fetchHbAskToSellerIssuesCount` | GET | `/api/v1.0/issues/count` | Bekleyen soru sayısı |
| `fetchHbAskToSellerIssueByNumber` | GET | `/api/v1.0/issues/{number}` | Tek soru detayı |
| `answerHbAskToSellerIssue` | POST | `/api/v1.0/issues/{number}/answer` | Soruyu cevapla |
| `rejectHbAskToSellerIssue` | POST | `/api/v1.0/issues/{number}/reject` | Soruyu reddet |

`answerHbAskToSellerIssue(params: { storeId, number, answerText })` body
şekli için HB dokümantasyonunda örnek ara; bulunamazsa `{ answer: answerText }`
iskeletiyle bırak + TODO.

---

## 5) `hepsiburadaReturns.ts`'e EKLE — Talep Oluşturma (yalnızca eksik parça)

Talep Entegrasyonu'nun "Onay/Red" ve "Listeleme" kısımları ZATEN
`hepsiburadaReturns.ts`'te var ve doğrulanmış. Yalnızca "Talep Oluşturma"
eksik — bu, `hepsiburadaTestOrder.ts`'teki stub deseniyle birebir aynı
mantık (yalnızca SIT'te var, test talebi üretmek için):

```
POST https://claim-stub-external-sit.hepsiburada.com/claims/merchant/{merchantid}/create
```

Base key: `CLAIM_STUB_SIT` (madde 1'de eklendi). Yeni fonksiyon
`createHbTestClaim(params: { storeId, claimPayload })` — `hepsiburadaTestOrder.ts`
içindeki `createHbTestOrder`'ı birebir örnek al (aynı guard: yalnızca
`environment === "test"`, aksi halde açık hata). Bu fonksiyonu ayrı bir
dosyaya değil, `hepsiburadaReturns.ts`'in sonuna ekle (aynı domain — talep/claim).

---

## 6) Yeni dosya: `src/lib/hepsiburadaSupplier.ts` — Tedarikçi Entegrasyonu

Base key: `SUPPLIER` (yeni eklenen). İki alt akış — Envanter ve Satın Alma:

**Envanter (listingUpdateRequests + supplierlistings):**

| Fonksiyon | Method | Path |
|---|---|---|
| `fetchHbListingUpdateRequests` | GET | `/suppliers/{merchantId}/listingUpdateRequests` |
| `createHbListingUpdateRequest` | POST | `/suppliers/{merchantId}/listingUpdateRequests` |
| `searchHbListingUpdateRequests` | POST veya GET (body/query ile arama — teyit edilmeli) | `/suppliers/{merchantId}/listingUpdateRequests/search` |
| `fetchHbListingUpdateRequestById` | GET | `/suppliers/{merchantId}/listingUpdateRequests/{requestId}` |
| `searchHbSupplierListings` | POST veya GET | `/suppliers/{merchantId}/supplierlistings/search` |

`/search` endpoint'leri için method HB dokümantasyonunda genelde POST + body
(filtre kriterleri) olur — `hbPostJson` ile dene, 405 alırsan GET+query'ye çevir.

**Satın Alma Süreci:**

| Fonksiyon | Method | Path |
|---|---|---|
| `searchHbOpenPurchaseOrders` | POST veya GET | `/suppliers/{merchantId}/openPurchaseOrders/search` |

Tüm fonksiyonlar dönüş tipi: `{ ok: true; data: unknown } | { ok: false; message: string }`
(liste dönenler için `{ ok: true; items: unknown[] }` — mevcut `fetchHbReturnClaims`
desenindeki gibi `extractX()` yardımcı fonksiyonuyla `items`/`data`/`content`
alanlarını normalize et).

---

## Kabul Kriterleri

1. `npx tsc --noEmit` hatasız geçmeli.
2. `hepsiburadaReturns.ts`'teki mevcut accept/reject/preapprovalconfirm/liste
   fonksiyonlarına DOKUNULMADI — yalnızca `createHbTestClaim` eklendi.
3. Her yeni base key (`SHIPPING`, `MPFINANCE`, `ASKTOSELLER`, `SUPPLIER`,
   `CLAIM_STUB_SIT`) `HB_BASE` ve `hbBaseUrl()`'e eklendi.
4. Prod domain adları "TAHMİNİ" olarak işaretlendi, `logger.warn` guard'ı eklendi.
5. `CLAIM_STUB_SIT` yalnızca `environment === "test"` iken çalışıyor,
   production'da açık hata veriyor (OMS_STUB_SIT ile aynı desen).
6. Ask-to-seller'daki tekrarlanan `/issues` URL'i (GET+POST) için ayrım net
   şekilde TODO olarak işaretlendi, sahte bir varsayımla üretime sürülmedi.
7. Yeni dosyalar mevcut `hbFetch`/`hbPostJson`/`hbPutJson` katmanını kullanıyor.
