# Maprithm Ticaret AI — Proje bağlamı (ChatGPT / LLM için tek parça)

**Kullanım:** Bu dosyanın tamamını (veya ihtiyaç halinde bölümlerini) bir sohbete **tek seferde** yapıştırabilirsiniz. Çok büyük modellerde tam şema için ek olarak `prisma/schema.prisma` dosyasını da ekleyin.

---

## 1. Ürün ne iş yapıyor?

- **Çok kiracılı (multi-tenant)** bir **e-ticaret operasyon paneli**: mağaza (`Store`) bazında ürün, içe aktarma, **Trendyol** entegrasyonu, **XML feed** ile katalog senkronu, sipariş / iade / finans akışları.
- Kullanıcılar `StoreMembership` + **RBAC** (rol + izin, mağaza bazlı sapmalar) ile yetkilendirilir.
- Ana değer: ürün verisini içe al (CSV/XLSX/XML), **Trendyol**’a eşleştirip yayınla, fiyat-stok güncelle, siparişleri çek.

---

## 2. Teknik yığın

| Katman | Seçim |
|--------|--------|
| Framework | **Next.js 14** (App Router), **React 18**, **TypeScript** |
| API | Route handlers: `src/app/api/**/route.ts` |
| ORM | **Prisma 5** + **PostgreSQL** |
| Auth | **NextAuth v5** (beta) — `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]` |
| Stil | **Tailwind CSS**, bileşenler `src/components/` |
| AI | **OpenAI** (ürün metni optimizasyonu vb.) |
| XML/CSV | `fast-xml-parser`, `papaparse`, `xlsx` |

**Komutlar:** `npm run dev` | `npm run build` / `npm start` | `npx prisma migrate deploy` | `npx prisma generate`

---

## 3. Dizin yapısı (özet)

```
src/
  app/
    (dashboard)/     # Oturum açık UI sayfaları (ürünler, ayarlar, Trendyol, XML…)
    (auth)/          # Giriş / kayıt sayfaları
    api/             # Tüm HTTP API (REST benzeri route.ts)
  components/        # UI bileşenleri
  lib/               # İş mantığı: prisma, Trendyol client, XML sync, fiyat hesaplama, vb.
prisma/
  schema.prisma
  migrations/
docs/                # TRENDYOL_CARGO.md vb.
```

---

## 4. Çok kiracılılık ve güvenlik

- Neredeyse tüm domain verisi **`storeId`** ile kapsüllenir; API’lerde **`requireActiveStore()`** ile `userId`, `storeId`, `membershipId`, izin listesi alınır.
- **`requirePermission(ctx, "permission.key")`** ile işlem bazlı kontrol.
- Trendyol API anahtarları **`ENCRYPTION_KEY`** ile şifrelenir (`MarketplaceConnection`).
- Sistem yöneticisi: `User.isSystemAdmin` — ayrı admin API’ler (`src/app/api/admin/`).

---

## 5. Veri modeli — Prisma modelleri (özet liste)

Ayrıntı için kaynak: `prisma/schema.prisma`.

| Model | Rolü |
|-------|------|
| **User** | Kullanıcı hesabı |
| **Store** | Mağaza (tenant) |
| **StoreMembership** | Kullanıcı ↔ mağaza ↔ **Role** |
| **Role** / **Permission** / **RolePermission** | Global rol–izin |
| **StoreRolePermission** | Mağaza bazlı rol–izin override |
| **StoreMembershipPermissionOverride** | Üyelik bazlı izin sapması |
| **UserSettings** | Mağaza başına `@@unique([storeId])` — şirket adı, varsayılan para/KDV/desi/komisyon vb. |
| **Product** | Ürün: `price` (Decimal, satış), `stock`, yaşam döngüsü, görseller, **costPrice** ve fiyat önerisi alanları, **contentHash / priceHash / stockHash** (XML akıllı senkron) |
| **ProductMarketplaceMapping** | Trendyol eşlemesi: barkod, kategori, marka, `cargoCompanyId`, fiyat/stok override bayrakları, yayın durumu |
| **ProductMarketplaceMapping** + **ProductMarketplaceAttribute** | Kategori özellikleri |
| **MarketplaceConnection** | Platform bağlantısı (Trendyol seller, şifreli anahtarlar, adres ID’leri, `defaultCargoCompanyId`) |
| **StoreTrendyolCargoCompany** | Mağaza bazlı Trendyol **cargoCompanyId** listesi (API sync → DB) |
| **MarketplaceCarrierReference** | Global Trendyol kargo kod referansı (ayrı senkron) |
| **XmlFeedSource** | XML URL, mağaza, son senkron özeti |
| **ImportJob** / **ImportRow** | Dosya içe aktarma işleri ve satırlar |
| **ImportRowMarketplaceSuggestion** | Önerilen eşleştirmeler |
| **TrendyolBrand** / **TrendyolCategory** / **TrendyolCategoryAttribute*** | Önbellek / referans |
| **TrendyolPublishJob** | Yayın kuyruğu |
| **MarketplaceOrder*** | Sipariş, satır, olay, fatura, kargo takip, webhook ile gelen yaşam döngüsü |
| **OrderSyncJob** / **StoreOrderSyncState** | Sipariş senkron işleri ve özet durum |
| **MarketplaceReturnClaim*** | İade talepleri |
| **TrendyolFinanceSyncRun** / **TrendyolFinanceLine** | CHE/finans senkronu |
| **TrendyolReturnReason** | İade sebepleri cache |
| **SystemMarketplaceConnection** / **SystemReferenceSyncLog** | Sistem geneli Trendyol bağlantısı ve referans senkron logu |
| **ActivityLog** | Denetim / aktivite kaydı |

---

## 6. Ana iş akışları

### 6.1 Ürün ve fiyatlandırma

- **Satış fiyatı:** `Product.price` (PATCH `/api/products/[id]`).
- **Maliyet (`costPrice`):** XML feed’den gelir; ilk dolum veya boşken bootstrap; dolu olduktan sonra **XML fiyat/stok-only senkronunda değiştirilmez** (satıştan bağımsız kalması için). “Fiyat önerisi kaydet” **maliyeti yazmaz** — sadece komisyon, kargo, KDV, hedef kâr.
- **Fiyat hesaplama:** `src/lib/pricingCalculator.ts`, API `POST /api/products/[id]/pricing-calculate`.

### 6.2 XML feed

- Parser: `src/lib/xmlFeedParser.ts`, `importParseXml.ts`, `importNormalize`.
- Akıllı diff: `src/lib/xmlFeedSmartDiff.ts` — içerik / fiyat / stok hash ile kovalar (priceOnly, stockOnly, contentChanged, …).
- Senkron motor: `src/lib/xmlFeedSync.ts` — DB güncelleme, Trendyol envanter API opsiyonel, publish pipeline.
- Zamanlama: `GET /api/cron/xml-feed-sync` (+ `CRON_SECRET`).

### 6.3 Trendyol

- Bağlantı ve ayarlar: `src/app/api/integrations/trendyol/*`.
- HTTP: `src/lib/trendyolFetch.ts`, kimlik/mağaza bağlamı.
- **Kargo firmaları:** `getCargoCompaniesForStore` (`src/lib/trendyol/getCargoCompaniesForStore.ts`) — önce DB, boşsa sync, sonra env/preset fallback; `POST .../cargo-companies/sync`.
- Ürün yayını: `trendyolPublishProduct`, pipeline, mapping API’leri, `ProductTrendyolMappingSection.tsx`.
- Sipariş webhook: `src/app/api/webhooks/trendyol/orders/route.ts`.

### 6.4 İçe aktarma (dosya)

- Import job API’leri: `src/app/api/imports/`.
- Onay sonrası uygulama: `src/lib/applyApprovedTrendyolImportSuggestions.ts` (örnek).

---

## 7. Ortam değişkenleri (isimler — değer vermeyin)

Kaynak: `.env.example`

- `DATABASE_URL` — PostgreSQL
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- `ENCRYPTION_KEY` — Trendyol API secret şifreleme
- `OPENAI_API_KEY`
- `TRENDYOL_CARGO_COMPANY_IDS` — kargo **yedek** listesi (birincil değil)
- `TRENDYOL_AGENT_NAME`, `TRENDYOL_FALLBACK_CLIENT_IP`, `TRENDYOL_ORDER_WEBHOOK_SECRET`
- `CRON_SECRET` — cron endpoint koruması

---

## 8. API yüzeyi (gruplar)

- **Auth:** `api/auth/*`, kayıt, şifre sıfırlama
- **Mağaza / RBAC:** `api/store/*`
- **Ürünler:** `api/products/*` (CRUD, fiyat hesaplama, Trendyol mapping, publish, unpublish, …)
- **Ayarlar:** `api/settings`
- **İçe aktarma:** `api/imports/*`
- **XML:** `api/xml-feeds/*`, cron `api/cron/xml-feed-sync`
- **Trendyol entegrasyon:** `api/integrations/trendyol/*` (bağlantı, adres, finans, webhook yönetimi, …)
- **Sipariş / iade:** `api/orders/*`, `api/returns/*`, `api/webhooks/trendyol/orders`
- **Cron:** `api/cron/*` (XML, sipariş arka plan, referans senkron, …)
- **Admin / sistem:** `api/admin/*`, health `api/health/*`
- **AI:** `api/ai/*`

Tam liste: `src/app/api` altında **100+** `route.ts`.

---

## 9. Veritabanı ve migration

- **Production:** `npx prisma migrate deploy` (şema drift’i önlemek için tek doğruluk kaynağı migration klasörü).
- Geçmişte **UserSettings** üzerinde `storeId` **unique** index eksikliği PostgreSQL **42P10** (upsert) hatasına yol açabiliyor — onarım migration’ları repoda (`repair_user_settings_storeid_unique` vb.).

---

## 10. Önemli iş kütüphaneleri (`src/lib/`)

| Alan | Dosya/klasör (örnek) |
|------|----------------------|
| Prisma singleton | `prisma.ts` |
| Mağaza bağlamı | `requireActiveStore.ts`, `permissionClient.ts` |
| Trendyol | `trendyolFetch.ts`, `trendyolPublishProduct.ts`, `trendyolPublishProductPipeline.ts`, `trendyol/*` (cargo sync, resolver) |
| XML | `xmlFeedSync.ts`, `xmlFeedSmartDiff.ts`, `xmlProductHashes.ts` |
| Fiyat | `pricingCalculator.ts` |
| Log | `activityLog.ts`, `logger.ts` |

---

## 11. Bilinen mimari kararlar (özet)

- Trendyol **cargoCompanyId:** kaynak önceliği **DB (StoreTrendyolCargoCompany)** → API sync → env/preset fallback; ayrıntı: `docs/TRENDYOL_CARGO.md`.
- **Maliyet vs satış:** `costPrice` XML ile hizalanır; “fiyat önerisi kaydet” maliyeti güncellemez.
- Çok kiracı: sorgular **`storeId` (+ `userId` where applicable)** ile sınırlandırılmalı.

---

## 12. ChatGPT’den ne isteyebilirsiniz? (örnek talimatlar)

- “Yukarıdaki bağlamda güvenlik ve `storeId` sızıntısı riski olan API’leri listele.”
- “Trendyol hata senaryoları için dayanıklılık öner.”
- “XML senkron ve ürün hash mantığını basitleştirme seçenekleri.”
- “Ölçeklenebilirlik: cron, kuyruk, Prisma connection pool.”

---

## 13. Ek: tam Prisma şeması

Tek mesajda token limiti doluyorsa: **`prisma/schema.prisma` dosyasını ayrı bir mesajda** ekleyin veya bu dokümanın **5. bölümü + şema dosyası** ikilisini kullanın.

---

*Dosya sürümü: repo ile birlikte güncellenmeli; otomatik üretim değildir.*
