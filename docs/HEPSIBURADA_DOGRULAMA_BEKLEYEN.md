# Hepsiburada — Doğrulama Bekleyen Maddeler



HB entegrasyon ekibi (`mpentegrasyon@hepsiburada.com`) veya SIT **Try It!** /  

`npx tsx scripts/hb-sit-live-verify.ts` ile teyit edilecek soru listesi.



Durum etiketleri:

- `[ ] Bekliyor` — doküman da canlı da yok

- `[x] Dokümanla doğrulandı — canlı test bekliyor` — body/path/method dokümandan net; SIT HTTP henüz yok

- `[x] Doğrulandı (YYYY-MM-DD, kaynak)` — gerçek istek atıldı ve geçti



**Önemli:** `llms.txt` / reference HTML bu ortamda Akamai captcha (403) ile

engellendi. Body/method doğrulaması için developers.hepsiburada.com OpenAPI

türevli açık kaynak (Lonca `@lonca/hepsiburada` tip + README örnekleri) +

görev prompt’undaki `soru-oluşturma` çözümü kullanıldı. Canlı SIT ayrı aşama.



Oluşturma: 2026-08-03  

Doküman taraması: 2026-08-03  

Canlı deneme: 2026-08-03 — **DB’de `platform=hepsiburada` bağlantısı yok**  

(`NO_HB_SIT_CONNECTION`). Hiçbir SIT HTTP çağrısı atılamadı.



---



### 1. Katalog — placeholder ürün/ticket endpoint'leri

- Dosya/fonksiyon: `hepsiburadaProductApi.ts` / `hepsiburadaProductUpdate.ts`

- Şu an davranış: `HB_UNVERIFIED` throw / iskelet

- Soru: request/response body örnekleri

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [ ] Bekliyor — HB SIT bağlantısı + destek/Try It! gerekli



### 2. Servis Anahtarı — Basic Auth rolü

- Dosya/fonksiyon: `hepsiburadaFetch.ts` → `HB_USE_SERVICE_KEY_AS_PASSWORD`

- Şu an davranış: DB `serviceKeyEncrypted` + env fallback; flag ile password override

- Soru: username / password / ayrı header?

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [ ] Bekliyor — HB SIT bağlantısı + destek gerekli



### 3. Envanter — alt upload / mapping / bulk-unlock

- Dosya/fonksiyon: `hepsiburadaListings.ts` / `hepsiburadaPriceStockPush.ts`

- Şu an davranış: POST placeholder; inventory-uploads implement

- Soru: alan tabloları + bulk-unlock body

- Canlı deneme (2026-08-03): yazma denemesi bilinçli atlandı (bağlantı yok + şema riski)

- Durum: [ ] Bekliyor — HB SIT bağlantısı + destek/Try It! gerekli



### 4. Paket işlemleri — body alan adları

- Dosya/fonksiyon: `hepsiburadaPackageOps.ts` + `changeHbPackageCargoCompany`

- Doküman sonucu (2026-08-03):

  - parcel-info PUT: `{ desi?, width?, height?, length?, weight? }`

  - warehouse PUT: `{ warehouseId }`

  - split POST: `{ lineItems: string[] }`

  - laborcost PUT: `{ laborCost }` — **yalnızca altın ürünler**

  - changecargocompany PUT: `{ cargoCompany }` (değer = GET ShortName/code)

- Şu an davranış: typed body + JSDoc “dokümanla doğrulandı; canlı SIT TEYİT EDİLMEDİ”

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [x] Dokümanla doğrulandı — canlı test bekliyor



### 5. Ask-to-Seller — POST `/api/v1.0/issues`

- Dosya/fonksiyon: `createHbTestQuestion` (eski `createHbAskToSellerAnswer` stub kaldırıldı)

- Doküman sonucu (2026-08-03): GET listeden ayrı; SIT-only test sorusu oluşturma

  (`soru-oluşturma`). Answer: `{ answer }`. Reject/sorun-bildirme:

  `POST .../issues/{number}/reject` body `{ reasonCode?, reason? }`.

- Şu an davranış: SIT-only guard (`environment !== "test"` → hata); prod çağrı yok

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [x] Dokümanla doğrulandı — canlı test bekliyor



### 6. Kargo profili body + prod domain adları

- Dosya/fonksiyon: `hepsiburadaCargoProfiles.ts` + `HB_BASE` TAHMİNİ prod URL’ler

- Şu an davranış: create body’ye merchantId ekleniyor (varsayım)

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [ ] Bekliyor — HB SIT bağlantısı + prod host teyidi gerekli



### 7. Tedarikçi `/search` method

- Dosya/fonksiyon: `hepsiburadaSupplier.ts`

- Doküman sonucu (2026-08-03): üç `/search` endpoint’i de **POST** + body

  (açık sipariş / envanter / teklif listeleme). 405’te GET fallback savunma olarak duruyor.

- Canlı deneme (2026-08-03): atlandı — HB SIT bağlantısı yok

- Durum: [x] Dokümanla doğrulandı — canlı test bekliyor



---



## İlgili



- Sync: `docs/HEPSIBURADA_SYNC_KARAR.md`

- Finans DB: platform-agnostik model yok → yalnız fetch (D2)

- Yeniden doğrulama: Ayarlar’da HB SIT kaydı → `npx tsx scripts/hb-sit-live-verify.ts`


