# Maprithm Ticaret AI — Trendyol Entegrasyonu — Devir Notu

Bu doküman, önceki sohbette Maprithm Ticaret AI projesinin Trendyol entegrasyonu üzerinde yapılan
tüm çalışmanın tam özetidir. Yeni bir sohbete yapıştırılıp doğrudan devam noktası olarak
kullanılabilir.

## 0. Ortam / Erişim Bilgileri

- **Proje yolu:** `C:\maprithm-ticaret-ai` (Windows, kullanıcı: hakan)
- **Stack:** Next.js 14 + Prisma + PostgreSQL, çok kiracılı (multi-tenant) e-ticaret/pazaryeri
  yönetim paneli.
- **Claude'un erişimi:**
  - `filesystem` MCP sunucusu → `C:\maprithm-ticaret-ai` dizinine okuma/yazma
  - `postgres` MCP sunucusu → `maprithm_ticaret_ai` veritabanına **salt okunur** sorgu
    (INSERT/UPDATE/DELETE **çalıştırılamıyor**, bu yüzden veri düzeltmeleri kod seviyesinde
    "kendi kendini onaran" mantıklarla yapıldı)
  - `claude-in-chrome` MCP sunucusu → kullanıcının gerçek Chrome tarayıcısında `localhost:3000`
    üzerinden canlı uygulamayı test edebiliyor (JavaScript ile doğrudan fetch çağırma en
    güvenilir yöntem oldu — `ref` tabanlı tıklamalar bazen güvenilmezdi)
- **Migration'lar Claude tarafından çalıştırılamıyor** — her şema değişikliğinden sonra kullanıcı
  kendi terminalinde `npx prisma migrate dev --name <isim>` çalıştırmak zorunda. Bazen
  `EPERM: query_engine-windows.dll.node` hatası çıkıyor (Windows dosya kilidi, `npm run dev`
  durdurulup `npx prisma generate` tekrar çalıştırılınca düzeliyor).
- **Gerçek Trendyol bağlantısı VAR ve TEST EDİLDİ** — production ortamda, gerçek Seller ID ile.
  Sürat Kargo aktif anlaşması var (cargoCompanyId=9). Test ürünleri oluşturulup gerçek
  Trendyol'a yayınlandı, sonra arşivlenip temizlendi.
- **Önemli araç notu:** `create_file` (sandbox) aracı bu oturumda birkaç kez **sessizce
  başarısız oldu** (başarı mesajı verdi ama dosya diske yazılmadı). `filesystem:write_file`
  her zaman güvenilir çalıştı. **Yeni dosya oluştururken her zaman `filesystem:write_file`
  kullan, sonra `filesystem:get_file_info` ile diskte gerçekten var olduğunu doğrula.**
- **Trendyol dokümantasyonuna erişim numarası:** `developers.trendyol.com` üzerindeki her
  sayfanın sonunda "Copy Page" özelliği var — sayfa URL'sinin sonuna `.md` eklenince temiz,
  makine-okunur markdown + gerçek endpoint/JSON şeması dönüyor. Standart `web_fetch` bazı
  sayfalarda (JS ile render edilen, az bilinen sayfalar) 404 veriyordu; kullanıcıdan "Copy Page"
  linkini alıp `.md` ile çekmek kesin çözüm oldu.

## 1. Orijinal 12 Maddelik Liste — Durumu

Kullanıcının elle yazdığı notlardan çıkarılan 12 geliştirme maddesi, kolaydan zora sıralanıp
hepsi tamamlandı:

1. ✅ XML'den gelen barkodlara önek ekleme (`UserSettings.xmlBarcodePrefix`)
2. ✅ Barkodların pazaryeri bazlı ayrı gönderilmesi (zaten mevcut mimari destekliyordu)
3. ✅ XML feed kurulumunda sabit marka seçimi (`XmlFeedSource.overrideBrandName`)
4. ✅ Ürün/fiyat/stok bazlı pazaryeri gönderim kısıtlamaları (`MarketplacePublishRule`)
5. ✅ Günlük yeni ürün listesi + seçerek gönderme (Ürünler sayfası "Yeni/Gönderilmemiş" filtresi
   + toplu gönderim)
6. ✅ Sipariş bazlı maliyet/kâr raporu (`/reports/order-profitability`)
7. ✅ Termin süresi seçimi (`deliveryDuration`/`fastDeliveryType`) + **kritik bulgu**: V1 API'nin
   10 Ağustos 2026'da devre dışı kalacağı keşfedildi ve V1→V2 geçişi yapıldı
8. ✅ XML feed bazlı sevkiyat/iade adresi override (`XmlFeedSource.shipmentAddressId/returnAddressId`)
9. ✅ Yayınlamadan önce önizleme ekranı (`TrendyolPublishPreviewModal`)
10. ✅ Farklı entegrasyondan geçiş — Trendyol'daki mevcut ürünleri XML'le eşleştirme
    (`trendyolCatalogReconcile.ts`, "Trendyol Kataloğunu Tara ve Eşleştir" butonu)
11. ⏸️ **Beklemede** — Kendi e-ticaret web sitesi (çok kiracılı SaaS storefront). Kullanıcı
    "önce 1-10'u oturtalım" dedi, henüz başlanmadı. Ayrı, büyük bir proje.
12. ⏸️ **Beklemede** — Trendyol E-Faturam entegrasyonu (e-fatura). Trendyol'un kendi ayrı ürünü
    (`developers.trendyolefaturam.com`) — üçüncü parti sağlayıcı yerine bu önerildi ama detaylı
    araştırılmadı, kullanıcı henüz karar vermedi.

## 2. Pazarda Fark Yaratacak Ek Geliştirmeler (12 maddenin dışında, kullanıcı isteğiyle eklendi)

Kullanıcı "pazarda bana ayrı değer katacak geliştirmeler" istediğinde şunlar eklendi:

- **Kademeli Fiyatlandırma** (`PricingTier` modeli) — maliyet fiyatı aralığına göre
  (0-100₺, 101-300₺ vb.) komisyon/kargo/hedef kâr oranı tanımlama. Ürün bazlı override > aralık
  eşleşmesi > mağaza varsayılanı önceliği. `resolveEffectivePricingInputs()` merkezi fonksiyon.
- **Buybox İzleme** (`/reports/buybox`) — Trendyol'un gerçek Buybox Kontrol Servisi'ni kullanarak
  (max 10 barkod/istek) hangi üründe kazanılıp kaybedildiğini gösteren salt-izleme raporu.
- **Otomatik Yeniden Fiyatlandırma** (Buybox Repricing) — Buybox İzleme + Kademeli Fiyatlandırma
  birleşimi. Buybox kaybedilince fiyatı otomatik düşürür. **Çift güvenlik**: hem mağaza genelinde
  (`BuyboxRepricingSettings.isActive`) hem ürün bazında (`ProductMarketplaceMapping.autoRepriceEnabled`)
  açık olmalı. Strateji: sabit ₺ düş / % düş / tam eşitle. Minimum kâr marjı tabanı + ürün bazlı
  taban fiyat koruması var. `computeRepriceTarget()` fonksiyonu tüm güvenlik mantığını içeriyor.

## 3. Trendyol API Dokümantasyon Derinlemesine İncelemesi — Bulgular

`developers.trendyol.com`'un TAMAMI tarandı, kod tabanıyla karşılaştırıldı:

**Zaten eksiksiz olduğu doğrulanan (kod incelemesiyle):** Ürün V1+V2, sipariş çekme
(`getShipmentPackages` + `getShipmentPackagesStream` — 10bin kayıt limiti için akıllıca zaten
implement edilmiş), paket durum bildirimleri, kargo firması değiştirme, ortak etiket, fatura
linki/dosyası gönderme, iade süreci, müşteri soruları, cari ekstre (CHE), adres bilgileri.

**Yanlış alarm olduğu ANLAŞILAN maddeler (düzeltildi):**
- "Order V2 geçişi" deadline'ı → Uluslararası Pazaryeri'ne ait, TR yerel entegrasyonunu
  etkilemiyor.
- "Askıdaki Sipariş Paketlerini Çekme" → Ayrı bir servis değil, mevcut `getShipmentPackages`'a
  `status` filtresi verilmezse zaten tüm durumlar (Awaiting dahil) geliyor — kod zaten doğru.

**Bu oturumda kod yazılıp GERÇEK dokümanla doğrulanan yeni servisler:**
- `updateBoxInfoOnTrendyol` — Desi/Koli Bildirimi. `PUT
  /integration/order/sellers/{sellerId}/shipment-packages/{packageId}/box-info`. Body:
  `{boxQuantity, deci}`. Özellikle Horoz/CEVA Lojistik için zorunlu.
- `updateLaborCostsOnTrendyol` — İşçilik Bedeli. `PUT .../labor-costs`. Body: dizi
  `[{orderLineId, laborCostPerItem}]`. Sadece belirli kategoriler (mücevher/sarrafiye/takı,
  ~40 kategori ID'si kodda listeli).
- `updateWarehouseOnTrendyol` — Depo Bilgisi. `PUT .../warehouse`. Body: `{warehouseId}`.
  Sadece Trendyol Express kullanan satıcılar için.
- `splitShipmentPackageOnTrendyol` (+ 3 varyant: `multiSplitShipmentPackageOnTrendyol`,
  `splitShipmentPackageByQuantityOnTrendyol`, `splitMultiPackageByQuantityOnTrendyol`) —
  Sipariş Paketlerini Bölme. `POST .../split`, `/multi-split`, `/quantity-split`,
  `/split-packages`.

Tüm bu fonksiyonlar `src/lib/trendyolShipping.ts` içinde. Karşılık gelen API route'ları
`src/app/api/orders/[id]/shipping/{update-box-info,labor-costs,update-warehouse,split-package}/route.ts`.

**Bu servislerin hiçbiri gerçek bir sipariş üzerinde canlı test edilmedi** (mağazada henüz
gerçek sipariş yok) — sadece "sahte ID → doğru 404" testiyle route kaydı doğrulandı.

## 4. UI Tarafı — Sipariş Detay Sayfası

`src/components/orders/OrderAdvancedShippingOperationsCard.tsx` (yeni bileşen) — Desi/Koli,
İşçilik Bedeli (satır bazlı), Depo Bilgisi, Paket Bölme (satır seçerek + onay modalı) için tam
UI. `src/app/(dashboard)/orders/[id]/page.tsx`'e `OrderShippingOperationsCard`'ın hemen altına
eklendi.

## 5. Menü/IA Yeniden Düzenleme (son yapılan iş)

`src/components/layout/sidebar-menu-config.ts` tamamen elden geçirildi:
- **"Trendyol Ayarları" artık Trendyol grubunda direkt link** (önceden menüde hiç yoktu, sadece
  Ayarlar sayfası içinden erişilebiliyordu — kritik ayarlar gizliydi).
- XML Beslemeler → Ürünler grubuna taşındı (ayarlarla ilgisi yoktu).
- Mağaza Kullanıcıları → Ayarlar grubuna taşındı (Yetki Yönetimi ile yan yana).
- "Mağaza" artık tek tık link (tek öğeli grup kaldırıldı).
- Her menü öğesine tutarlı ikon eklendi.
- **Bu değişiklik tarayıcıda TEST EDİLEMEDİ** — MCP bağlantısı (hem Chrome hem postgres) o anda
  yanıt vermemeye başladı (4 dakika timeout, birkaç kez). Kullanıcıdan Claude Desktop'ı kontrol
  etmesi istendi. **Yeni sohbette ilk iş bu menü değişikliğini tarayıcıda doğrulamak olmalı.**

## 6. Bilinen Sınırlamalar / Riskler

- **`postgres` aracı salt okunur.** Veri düzeltmesi gerekiyorsa ya kullanıcıdan SQL çalıştırmasını
  iste, ya da kod seviyesinde self-healing mantığı yaz (örnek: `trendyolPublishProductPipeline.ts`
  içindeki `contentId` self-healing — DB'de yanlış `APPROVED` etiketi varsa otomatik `UNAPPROVED`'a
  düşürüp onaysız yola yönlendiriyor).
- **MCP bağlantısı zaman zaman donuyor** (4 dakika timeout, hem Chrome hem postgres aynı anda).
  Genelde kendiliğinden düzeliyor, `SELECT 1;` gibi hafif bir sorguyla test edilebilir.
- **Tarayıcı otomasyonunda `ref` tabanlı tıklama bazen güvenilmez** (özellikle checkbox'larda
  React state güncellemiyor, uzun süre açık kalan sekmelerde renderer donabiliyor). En güvenilir
  yöntem: `claude-in-chrome:javascript_tool` ile doğrudan `fetch()` çağırıp API'yi test etmek.
- **`splitShipmentPackage` vb. servisler canlı sipariş olmadan test edilemez** — gerçek bir
  sipariş geldiğinde birlikte doğrulanmalı.
- Bir üründe (`80288751-...`) veri tutarsızlığı bulunup kod seviyesinde otomatik düzeltilecek
  şekilde çözüldü, ama bu tür başka tutarsızlıklar mağazada başka ürünlerde de olabilir
  (kullanıcı bağlantı kopukluğu sırasında kendi tarayıcısından manuel testler yapmıştı).

## 7. Sırada Ne Var (Kullanıcının Son İsteği ve Sonrası)

1. **ACİL — Menü değişikliğini tarayıcıda test et** (yukarıda #5, hiç doğrulanmadı).
2. Yeni eklenen 4 Trendyol servisinin (Desi/Koli, İşçilik Bedeli, Depo, Paket Bölme) hem backend
   hem UI'sının **gerçek bir sipariş üzerinde** çalıştığını doğrula (sipariş sync'i tetikleyip
   gerçek `shipmentPackageId` ile).
3. Kullanıcı onaylarsa: **Madde 11** (kendi e-ticaret web sitesi, çok kiracılı storefront) veya
   **Madde 12** (Trendyol E-Faturam entegrasyonu) — ikisi de büyük, ayrı planlama gerektiren
   projeler, henüz başlanmadı.
4. Video Oluşturma/Listeleme, Tazmin Entegrasyonu, AB Ürün Etiketi — düşük öncelikli, muhtemelen
   hiç gerekmeyecek Trendyol servisleri (kasıtlı olarak atlandı).
5. Genel öneri: Artık büyük ölçüde tamamlanmış bir sistemin **gerçek kullanıcı/sipariş
   trafiğiyle** stres testi ve UI/UX ince ayarları iyi bir sonraki adım olabilir.

## 8. Çalışma Tarzı Notları (bu oturumda öğrenilenler)

- Kullanıcı doğrudan, teknik, "eksiksiz tamamla" talimatları veriyor — kapsamı daraltmadan,
  gerçek testle doğrulanmış iş istiyor.
- Belirsiz/doğrulanamayan API detaylarında **tahminle kod yazmak yerine dürüstçe belirtip
  dokümantasyon istemek** doğru karşılık buldu (`.md` Copy Page çözümü buradan çıktı).
- Migration/gerçek test gerektiren her adımda kullanıcıdan net, tek bir aksiyon istemek
  (örn. "şunu çalıştır", "şu sayfayı aç ve Copy Page linkini yapıştır") en verimli işbirliği
  şekli oldu.
