# Maprithm Ticaret AI — Platform Özeti ve Kullanım Rehberi

Bu belge, uygulamanın **teknik yapısını** (veritabanı, ekranlar, akışlar) ve **son kullanıcılar için adım adım kılavuzu** bir arada tutar. Aylar/yıllar sonra “ne yaptık, nerede ne var?” sorusuna cevap vermek amacıyla yazılmıştır.

---

## 1. Kısa mimari

| Katman | Teknoloji | Not |
|--------|-----------|-----|
| Uygulama | Next.js 14 (App Router), React | Sunucu ve istemci bileşenleri |
| Kimlik | NextAuth | Oturum; aktif mağaza (`activeStoreId`) ve izin listesi |
| Veri | PostgreSQL + Prisma ORM | Çok kiracılı (multi-tenant) **mağaza (Store)** modeli |
| Pazaryeri | Trendyol Partner API | Kimlik: mağaza bazlı `MarketplaceConnection` |

**Mağaza merkezli çalışma:** Çoğu işlem `storeId` ile sınırlıdır. Kullanıcı `StoreMembership` üzerinden bir mağazaya bağlanır; menü ve API çağrıları **aktif mağaza** bağlamında çalışır.

---

## 2. Veritabanı tabloları (işlev özetleri)

Tablolar, **işlev gruplarına** göre listelenmiştir. Tam alan listesi için `prisma/schema.prisma` kaynak kabul edilir.

### 2.1 Kimlik, mağaza ve yetkilendirme (RBAC)

| Tablo | Ne işe yarar? |
|-------|----------------|
| **User** | Giriş yapan kullanıcı; şifre, e-posta, `isSystemAdmin`. |
| **Store** | Mağaza (isim, slug, para birimi, durum). Tüm operasyonel verinin üst kiracısı. |
| **StoreMembership** | Kullanıcı ↔ mağaza ↔ **Role** bağlantısı. |
| **Role** | Rol tanımı (`owner`, `admin`, `editor`, …). |
| **Permission** | İzin anahtarı (`orders.view`, `marketplace.publish`, …). |
| **RolePermission** | Global rol ↔ izin matrisi (seed ile doldurulur). |
| **StoreRolePermission** | Belirli mağazada role göre izinleri aç/kapa sapması. |
| **StoreMembershipPermissionOverride** | Tek üyede izin ince ayarı. |

### 2.2 Ürün ve Trendyol eşleştirme

| Tablo | Ne işe yarar? |
|-------|----------------|
| **Product** | Yerel ürün kartı: fiyat, stok, yaşam döngüsü (`lifecycleStatus`), görseller, hash’ler (XML akıllı senkron için). |
| **ProductMarketplaceMapping** | Ürünün Trendyol tarafındaki eşleniği: barkod, kategori, marka, fiyat/stok override, `publishStatus`, `batchRequestId`, hata mesajı. |
| **ProductMarketplaceAttribute** | Mapping üzerinde Trendyol kategori özellikleri (attributeId / değer). |
| **ActivityLog** | Mağaza + kullanıcı bazlı işlem günlüğü (ürün/sipariş vb. aksiyonlar). |

### 2.3 Trendyol global referans (senkronize katalog)

Mağazadan bağımsız **tek kopya** referans tabloları (cron / sistem bağlantısı ile güncellenir).

| Tablo | Ne işe yarar? |
|-------|----------------|
| **TrendyolBrand** | Trendyol marka listesi. |
| **TrendyolCategory** | Kategori ağacı (parent, yaprak bayrakları). |
| **TrendyolCategoryAttribute** | Yaprak kategoriye göre zorunlu/opsiyonel özellik tanımları. |
| **TrendyolCategoryAttributeValue** | Özellik için izin verilen değerler. |

### 2.4 Pazaryeri bağlantısı ve yayın işleri

| Tablo | Ne işe yarar? |
|-------|----------------|
| **MarketplaceConnection** | Mağaza başına Trendyol: şifrelenmiş API key/secret, `sellerId`, `userAgent`, ortam, gönderim/iade **adres ID**’leri, **CHE için `cheSupplierId`** (boşsa sellerId kullanılır). |
| **TrendyolPublishJob** | Batch iş kaydı: `batchRequestId`, durum, ürün oluşturma / silme vb. (`batchRequestType`). |

### 2.5 Siparişler ve lojistik

| Tablo | Ne işe yarar? |
|-------|----------------|
| **MarketplaceOrder** | Paket bazlı sipariş: `shipmentPackageId`, durum, müşteri özeti, kargo alanları, fatura linki durumu, split paket ilişkileri. |
| **MarketplaceOrderLine** | Sipariş kalemleri (barkod, adet, fiyat). |
| **MarketplaceOrderEvent** | Sipariş/paket yaşam döngüsü olayları. |
| **MarketplaceOrderTrackingEvent** | Kargo takip zaman çizelgesi (panel/API kaynaklı). |
| **MarketplaceOrderShippingEvent** | Sevkiyat operasyonu denemeleri (etiket, provider değişimi vb.). |
| **MarketplaceOrderInvoice** | Fatura kayıtları / çoklu fatura senaryosu desteği. |
| **OrderSyncJob** | Sipariş çekme job’ı: kuyruk, heartbeat, kilidi, sayaçlar, hata. |
| **StoreOrderSyncState** | Mağaza bazlı son başarılı senkron / webhook özeti. |
| **MarketplaceCarrierReference** | Global kargo sağlayıcı referansı (`providerCode`). |

### 2.6 İadeler

| Tablo | Ne işe yarar? |
|-------|----------------|
| **MarketplaceReturnClaim** | İade talebi özeti (claimId, durum, sipariş referansları). |
| **MarketplaceReturnClaimLine** | İade kalemleri. |
| **MarketplaceReturnClaimEvent** | Onay/red vb. olaylar. |
| **TrendyolReturnReason** | Mağazaya özel veya senkronize iade nedeni kodları. |

### 2.7 Finans (Trendyol CHE — cari ekstre)

| Tablo | Ne işe yarar? |
|-------|----------------|
| **TrendyolFinanceSyncRun** | Tek seferlik API çekimi meta verisi: `settlements` / `otherfinancials`, tarih aralığı (ms), filtreler, HTTP sonucu, toplam sayfa/eleman, ham sayfa özeti. |
| **TrendyolFinanceLine** | Ekstre satırı: Trendyol `externalId` ile mağaza+tür bazında tekil; borç/alacak, sipariş no, ham JSON. |

### 2.8 İçe aktarma, XML, ayarlar

| Tablo | Ne işe yarar? |
|-------|----------------|
| **ImportJob** / **ImportRow** | Dosyadan toplu ürün içe aktarma işi ve satırlar. |
| **ImportRowMarketplaceSuggestion** | AI/öneri ile marka-kategori eşlemesi. |
| **ImportRowMarketplaceSuggestedAttribute** | Önerilen özellik değerleri. |
| **XmlFeedSource** | XML besleme URL’si, senkron sıklığı, son senkron istatistikleri. |
| **UserSettings** | Mağaza başına varsayılan KDV, komisyon, kargo, kârlılık parametreleri. |

### 2.9 Sistem (yönetici)

| Tablo | Ne işe yarar? |
|-------|----------------|
| **SystemMarketplaceConnection** | Global Trendyol sistem bağlantısı (referans senkron için). |
| **SystemReferenceSyncLog** | Global sync log kayıtları. |

---

## 3. Ekranlar ve rotalar

Aşağıda **URL**, **amaç**, **tipik izin** ve **ilişkin veri/API** özeti verilmiştir. Menü yapısı `src/components/layout/sidebar-menu-config.ts` ile uyumludur.

### 3.1 Genel ve kimlik

| Sayfa | URL | Amaç |
|-------|-----|------|
| Kök yönlendirme | `/` | Oturuma göre yönlendirme. |
| Giriş | `/login` | E-posta/şifre. |
| Kayıt | `/register` | Yeni kullanıcı. |
| Mağaza oluştur | `/register-store` | İlk mağaza / üyelik. |

### 3.2 Dashboard (giriş sonrası)

| Sayfa | URL | Amaç | İzin / not |
|-------|-----|------|-------------|
| Özet panel | `/dashboard` | Mağaza özeti | Oturum + aktif mağaza |

### 3.3 Siparişler ve iadeler

| Sayfa | URL | Amaç | İzin | İlgili tablolar |
|-------|-----|------|------|------------------|
| Sipariş listesi | `/orders` | Paket bazlı liste | `orders.view` | `MarketplaceOrder` |
| Sipariş detay | `/orders/[id]` | Satırlar, kargo, fatura, aksiyonlar | `orders.view` / yönetim API’leri `orders.manage` | Yukarıdaki + event tabloları |
| İade listesi | `/returns` | İade talepleri | `returns.view` | `MarketplaceReturnClaim` |
| İade detay | `/returns/[id]` | Onay/red, kargo güncelleme | `returns.view` / `returns.manage` | Claim + events |

### 3.4 Ürünler

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| Liste | `/products` | Ürün envanteri | `products.view` |
| Detay | `/products/[id]` | Fiyatlandırma, AI, **Trendyol eşleştirme kartı** | `products.view` (+ güncelleme izinleri ilgili aksiyonlarda) |
| Düzenle | `/products/[id]/edit` | Form ile düzenleme | `products.update` |
| Yeni | `/products/new` | Manuel ürün | `products.create` |
| Sağlık | `/products/health` | Yayın/eksik kontrol görünümleri | `products.view` |
| Import | `/products/import` | Dosyadan içe aktarım girişi | `imports.manage` |

**Ürün detayındaki Trendyol bölümü:** Yerel `Product` + `ProductMarketplaceMapping` ile Trendyol’a gönderim, fiyat/stok güncelleme, arşiv, **içerik PUT güncelleme**, **platformdan silme (DELETE + batch)** gibi işlemler bu sayfadan tetiklenir (izinler: `marketplace.publish`, `pricing.update` vb.).

### 3.5 İçe aktarma ve Trendyol önerileri

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| İş listesi | `/imports` | Import job’ları | `imports.manage` |
| İş detayı | `/imports/[id]` | Satır durumları | `imports.manage` |
| Trendyol önerileri | `/imports/[id]/trendyol-suggestions` | Marka/kategori öneri akışı | `imports.manage` |

### 3.6 Trendyol menü grubu

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| Yayın hazırlık | `/trendyol/publish-readiness` | Toplu hazır mı kontrolü | `marketplace.publish` |
| Batch işler | `/trendyol/publish-jobs` | Kuyruk listesi | `marketplace.publish` |
| Batch detay | `/trendyol/publish-jobs/[batchRequestId]` | Tek batch sonucu | `marketplace.publish` |
| Müşteri soruları | `/trendyol/customer-questions` | QnA listesi | `trendyol.questions.view` |
| Soru detayı | `/trendyol/customer-questions/[id]` | Okuma/cevap | Cevap: `trendyol.questions.answer` |
| **Cari ekstre (CHE)** | `/trendyol/finance` | Settlements/otherfinancials çekimi ve kayıtlı satırlar | Görüntüleme: `trendyol.finance.view`, senkron: `trendyol.finance.sync` |

### 3.7 XML beslemeler

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| Liste / düzenleme | `/xml-feeds` | XML kaynak ve senkron | `feeds.manage` |

### 3.8 Ayarlar ve mağaza

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| Genel ayarlar | `/settings` | Şirket / varsayılan oranlar | `store.settings.manage` |
| **Trendyol entegrasyonu** | `/settings/trendyol` | API kimliği, adresler, **CHE supplierId**, webhook paneli, ürün sağlayıcıları önizleme | `marketplace.integrations.manage` |
| Yetki yönetimi | `/store/permissions` | Rol / mağaza izinleri | `store.rbac.manage` |
| Mağaza kullanıcıları | `/store/users` | Üyeler | `store.users.manage` |
| Mağaza özeti | `/store` | Mağaza bilgisi | Genelde üye |

### 3.9 AI (ürün)

| Sayfa | URL | Amaç | İzin |
|-------|-----|------|------|
| AI ürün oluştur | `/ai-product` | Tek ürün üretimi | `products.create` |
| (Liste) | `/ai-products` | Yönlendirme / liste | — |

### 3.10 Sistem yöneticisi (`isSystemAdmin`)

| Sayfa | URL | Amaç |
|-------|-----|------|
| Sistem bağlantıları | `/admin/system-connections` | Global Trendyol sistem credential |
| Referans senkron | `/admin/reference-sync` | Marka/kategori cron yönetimi |
| Sistem durumu | `/admin/system-status` | Operasyonel özet / log filtreleri |
| Test Lab | `/admin/test-lab` | Sandbox senaryoları |

---

## 4. Önemli API uçları (geliştirici özeti)

Tam liste `src/app/api/**` altında. Burada sık kullanılan gruplar:

- **Trendyol bağlantı:** `GET/POST /api/integrations/trendyol/connection`  
- **Adresler:** `GET /api/integrations/trendyol/addresses` (önce product path, 404’te legacy)  
- **CHE senkron:** `POST /api/integrations/trendyol/finance/sync`  
- **CHE satırlar:** `GET /api/integrations/trendyol/finance/lines`  
- **CHE geçmiş koşular:** `GET /api/integrations/trendyol/finance/runs`  
- **Ürün sağlayıcıları:** `GET /api/integrations/trendyol/product-providers`  
- **Ürün yayın:** `POST /api/products/[id]/trendyol-publish`  
- **İçerik güncelle:** `POST /api/products/[id]/trendyol-content-update` (PUT)  
- **Platform sil:** `POST /api/products/[id]/trendyol-platform-delete` (DELETE + batch)  
- **Webhook’lar:** `/api/integrations/trendyol/webhooks` ve alt kaynaklar  
- **Cron:** `src/app/api/cron/*` (sipariş, referans, XML)

---

## 5. Son kullanıcı kılavuzu (adım adım)

### 5.1 İlk kurulum

1. **Kayıt** ve **giriş** yapın.  
2. **Mağaza oluşturun** (`/register-store`).  
3. Bir kullanıcıya uygun **rol** atandığından emin olun (owner/admin operasyon için yeterli izinlere sahiptir — detay `prisma/seed.js`).

### 5.2 Trendyol’u bağlama

1. **Ayarlar → Trendyol** (`/settings/trendyol`) sayfasına gidin (izin: entegrasyon yönetimi).  
2. **Seller ID**, **User-Agent**, **API Key / Secret**, ortam (production/stage) girin.  
3. **Adresleri getir** ile gönderim ve iade adresi seçin; **Kaydet** deyin.  
4. İsteğe bağlı: **CHE supplierId** — cari ekstre API’sinde `supplierId` Seller ID’den farklıysa buraya yazın; boş bırakılırsa Seller ID kullanılır.  
5. **Bağlantıyı test et** ile doğrulayın.

### 5.3 Ürün oluşturma ve Trendyol’a gönderme

1. **Ürünler** üzerinden ürün ekleyin veya **dosya içe aktarma** kullanın.  
2. Ürün **detay** sayfasında **Trendyol eşleştirme** bölümünde: marka, yaprak kategori, barkod, kargo, özellikler ve görselleri tamamlayın.  
3. **Trendyol’da yayınla** → Batch ID ile **Trendyol Batch İşleri** ekranından sonucu takip edin.  
4. Yayındayken:  
   - **Fiyat/Stok güncelle** — hızlı ticari güncelleme.  
   - **İçerik güncelle (PUT)** — tam içerik gövdesi (yayında + stok &gt; 0 ve hazırlık tam ise).  
   - **Trendyol’dan sil** — platformda silme talebi (batch); yerel ürün silinmez.  
   - **Arşiv / yayından kaldır** — mevcut akışlar.

### 5.4 Sipariş ve iade

- **Siparişler:** Liste ve detaydan paket durumu, kargo, fatura işlemlerine erişin (rolünüze göre).  
- **İadeler:** Listeden talebi açıp onay/red akışını kullanın.

### 5.5 Cari ekstre (CHE)

1. **Trendyol → Cari ekstre (CHE)** sayfasına gidin.  
2. Görüntüleme için `trendyol.finance.view`, çekme için `trendyol.finance.sync` gerekir.  
3. **Tür:** `settlements` veya `otherfinancials`.  
4. **transactionType:** Dokümantasyona uygun değer (ör. `Sale`, `Return`, `PaymentOrder` …).  
5. Tarih aralığı **en fazla 15 gün** (Trendyol kuralı).  
6. Çekim sonrası satırlar veritabanında listelenir; aynı Trendyol satır kimliği tekrar çekilirse **güncellenir**.

### 5.6 Müşteri soruları (QnA)

- **Trendyol → Müşteri soruları** ile listeleme; detayda cevap (izin gerektirir).

### 5.7 XML besleme

- **Ayarlar → XML Beslemeler** (veya menüdeki ilgili giriş) ile URL tanımlayıp senkron takibi.

---

## 6. Ortam değişkenleri (hatırlatma)

Projede sık kullanılanlar (`.env` — tam listeyi repodaki örnekle karşılaştırın):

- `DATABASE_URL` — PostgreSQL  
- `ENCRYPTION_KEY` / şifreleme — bağlantı sırları için  
- `TRENDYOL_STOREFRONT_CODE` — bazı Trendyol çağrılarında (ör. ürün silme header); varsayılan genelde `TR`  
- `TRENDYOL_AGENT_NAME`, `TRENDYOL_FALLBACK_CLIENT_IP` — API header yardımcıları  
- NextAuth ve cron secret’ları — ilgili route dokümantasyonuna bakın  

---

## 7. Bakım: migration ve seed

- Şema değişiklikleri: `prisma/migrations/`  
- Üretim uyumlu uygulama: `npx prisma migrate deploy`  
- İzin/rol güncellemesi: `node prisma/seed.js` (mevcut veriyi bozmadan upsert eder)  
- Prisma Client: `npx prisma generate` (Windows’ta kilit hatası olursa çalışan Node süreçlerini kapatıp tekrar deneyin)

### 7.1 Canlı sunucuda “eski sürüm” veya eksik menü (İadeler görünmüyor)

Kod GitHub `main` dalındaysa sorun çoğunlukla **sunucunun son commit’i çekmemesi**, **build/migration atlanması** veya **oturumda eski izin listesi** olur.

1. Sunucuda repo kökünde: `git fetch origin && git rev-parse HEAD && git rev-parse origin/main` — ikisi aynı commit olmalı.  
2. `scripts/deploy.sh` çalıştırın (veya el ile: `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, `npm run build`, uygulamayı yeniden başlatın).  
3. Yeni menüler (İadeler, Trendyol CHE, vb.) için `Permission` / `RolePermission` güncellenmiş olmalı: **bir kez** `RUN_SEED=1 ./scripts/deploy.sh` veya `node prisma/seed.js` (üretimde yalnızca gerektiğinde; seed çoğunlukla upsert yapar).  
4. Kullanıcılar **çıkış yapıp tekrar giriş** yapmalı; `permissionKeys` JWT’de saklanır, eski oturumda `returns.view` olmayabilir.  
5. Menü: **İadeler** solda yalnızca `returns.view` izni varsa görünür (`sidebar-menu-config.ts`).

---

## 8. Belgeyi güncelleme

Yeni büyük özellik eklendiğinde:

1. `prisma/schema.prisma` içinde yeni tabloya bu dokümanda **§2** altında yer açın.  
2. Yeni rota için **§3** tablosuna satır ekleyin.  
3. Kullanıcı adımları **§5** içine kısa bir alt başlık olarak eklenin.

---

*Son güncelleme: Bu belge, çok kiracılı mağaza modeli, Trendyol entegrasyonu, sipariş/iade operasyonları, CHE finans senkronu ve ürün yaşam döngüsü (PUT/DELETE dahil) ile uyumlu olacak şekilde yazılmıştır.*
