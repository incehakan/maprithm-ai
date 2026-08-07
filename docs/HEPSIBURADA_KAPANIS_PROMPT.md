# GÖREV: Hepsiburada Entegrasyonu — Kapanış Turu (4 promptun açık işleri)

## Bağlam

Önceki 4 promptun ("Katalog", "Listeleme/Envanter", "OMS Tamamlama",
"Kargo/Muhasebe/Talep/Tedarikçi") her biri, path/body şeması dokümantasyondan
%100 teyit edilemeyen noktalarda **bilinçli olarak placeholder/TODO** bıraktı.
Bu disiplin doğruydu — DEĞİŞTİRME. Bu son tur, o placeholder'ları 4 ayrı
başlıkta kapatıyor: (A) HB ile teyit listesi çıkar, (B) tamamlanmış lib'lere
UI/route ekle, (C) order-sync çelişkisini çöz, (D) DB/schema kararlarını uygula.

Bu 4 başlığı SIRAYLA yap — B, A'da teyit edilmemiş endpoint'lere route
bağlamasın; C ve D birbirinden bağımsız, paralel yapılabilir.

---

## BÖLÜM A — HB Doğrulama Kontrol Listesi (kod değil, doküman çıktısı)

Aşağıdaki her madde için kod YAZMA — bunun yerine
`docs/HEPSIBURADA_DOGRULAMA_BEKLEYEN.md` adında, HB entegrasyon ekibine
(mpentegrasyon@hepsiburada.com) veya "Try It!" panelinden tek tek sorulacak/
denenecek net bir soru listesi oluştur. Her madde: dosya + fonksiyon adı +
"şu an ne yapıyor" + "hangi soru teyit edilmeli" formatında.

Listeye alınacak maddeler (4 promptun "yapılmayanlar" özetinden):

1. **Katalog** (`hepsiburadaProductApi.ts` / `hepsiburadaProductUpdate.ts`):
   approve/reject-prematch, delete başlat, fastlisting, all-products-of-merchant,
   POST check-product-status, ticket-api — her biri için request/response
   body örneği isteniyor.
2. **Servis Anahtarı**: Basic Auth'ta username mi password mu, yoksa ayrı bir
   header mı (`hepsiburadaFetch.ts` → `HB_USE_SERVICE_KEY_AS_PASSWORD`).
3. **Envanter** (`hepsiburadaListings.ts`): price/stock/shipping/additional
   POST alan tablosu; sku/merchantsku mapping path'i; bulk-unlock (404 şema).
4. **Paket işlemleri** (`hepsiburadaPackageOps.ts`): parcel-info, warehouse,
   split, laborcost — PUT/POST body alan adları (şu an çağıran taraf body'yi
   olduğu gibi geçiriyor, hiçbir alan adı doğrulanmadı).
5. **Ask-to-Seller** (`hepsiburadaAskToSeller.ts`): `/api/v1.0/issues` GET ile
   aynı path'teki POST'un gerçek işlevi ne (liste mi, farklı bir aksiyon mu).
6. **Kargo/Shipping** (`hepsiburadaCargoProfiles.ts`): profile
   createByMerchantId / updateByMerchantId body şeması; prod domain adları
   (`SHIPPING`, `MPFINANCE`, `ASKTOSELLER`, `SUPPLIER` — şu an "-sit" son eki
   kaldırılarak TAHMİNİ türetildi, gerçek prod domain adı teyit edilmeli).

7. **Tedarikçi** (`hepsiburadaSupplier.ts`): `/search` endpoint'lerinin
   gerçek method'u (POST+body mi GET+query mi) — kodda "dene, 405 alırsan
   değiştir" notuyla bırakıldı, gerçek sonuç yazılmalı.

Her madde için çıktı formatı:
```md
### N. <Başlık>
- Dosya/fonksiyon: `...`
- Şu an davranış: ...
- Soru: "... path'inin body şeması nedir? / method GET mi POST mu?"
- Nasıl teyit edilir: Try It! paneli canlı hesapla denenerek / HB destek e-postası
- Durum: [ ] Bekliyor
```
Bu dosya `git` ile takip edilecek — HB'den cevap geldikçe `[ ] Bekliyor` →
`[x] Teyit edildi (tarih, kaynak)` olarak güncellenip ilgili koddaki TODO
kaldırılacak. **Bu bölümde kod dosyalarına DOKUNMA.**

---

## BÖLÜM B — Tamamlanmış lib'lere UI/route ekle

Mevcut route mimarisi (incelendi): `src/app/api/integrations/hepsiburada/*`
(bağlantı/ayar tipi işlemler), `src/app/api/orders/hepsiburada/*` (sipariş
senkron), `src/app/api/returns/hepsiburada/*` (iade), ve platform-agnostik
`src/app/api/orders/[id]/actions` + `src/app/api/orders/[id]/shipping`
(tekil sipariş üzerinde aksiyon — Trendyol da bunu kullanıyor).

**Yalnızca BÖLÜM A'da "doğrulandı" işaretli veya zaten path/method net olan
fonksiyonlara route ekle.** Placeholder/TODO'lu fonksiyonlara route bağlama —
kırık bir UI aksiyonu sunmuş oluruz (önceki promptların "placeholder'lar için
UI butonu eklenmedi" ilkesiyle tutarlı).

Eklenecek route'lar (yeni klasörler, `route.ts`, mevcut route'lardaki
auth/`requireActiveStore` deseniyle):

| Route | Kullandığı lib fonksiyonu | Not |
|---|---|---|
| `orders/[id]/actions` içine yeni case | `sendHbIntransitAction`, `sendHbInvoiceLink` (düzeltilmiş path) | mevcut action dispatcher'a case ekle, yeni dosya açma |
| `orders/hepsiburada/[id]/split` | `splitHbPackage` | yeni route |
| `orders/hepsiburada/[id]/warehouse` | `updateHbPackageWarehouse` | yeni route |
| `orders/hepsiburada/status-feed/[status]` | `hepsiburadaStatusFeeds.ts` fonksiyonları | admin/test-lab tarzı basit görüntüleme, dinamik `[status]` param → doğru fonksiyona map |
| `returns/hepsiburada/[id]/preapprove` | `preApproveHbReturnClaim` | zaten lib'de var, route eksikti |
| `integrations/hepsiburada/cargo-firms` | `fetchHbCargoFirms` | ayarlar sayfası için dropdown veri kaynağı |
| `integrations/hepsiburada/ask-to-seller` | `fetchHbAskToSellerIssues`, `fetchHbAskToSellerIssuesCount`, cevap/red route'ları | yeni bir "Sorular" sekmesi gerekebilir — UI kapsamı büyükse önce yalnızca API route'larını yaz, sayfayı ayrı bir işte planla |

UI tarafında (varsa) mevcut sayfa desenlerini birebir kopyala — yeni bir
component kütüphanesi/stil sistemi icat etme, `frontend-design` skill'ini
yalnızca gerçekten yeni bir sayfa (örn. "Sorular" listesi) açılıyorsa oku.

---

## BÖLÜM C — `hepsiburadaOrderSync.ts` vs. statü-bazlı feed çelişkisini çöz

Şu an iki farklı yaklaşım aynı anda kodda duruyor:
- Eski: `GET /packages/merchantid/{merchantId}/packages?status=...&offset=...`
- Yeni (`hepsiburadaStatusFeeds.ts`): her statü için dedike path
  (`/delivered`, `/shipped`, `/undelivered`, `/status/unpacked`, vb.)

**Çözüm adımları (test ortamında, gerçek/test mağaza hesabıyla):**

1. Aktif bir SIT bağlantısı olan bir store bul (yoksa `admin/test-lab`
   altındaki test mağaza akışını kullan).
2. Her iki endpoint ailesini de canlı çağır, ikisinin de 200 döndüğünü ve
   makul veri içerdiğini doğrula. Loglarını `docs/HEPSIBURADA_SYNC_KARAR.md`
   dosyasına kaydet (istek/yanıt özet — tam PII/kimlik bilgisi YAZMA).
3. Üç olası sonuç:
   - Yalnızca eski çalışıyor → yeni statü-feed dosyasını `@deprecated` işaretle,
     silme (ileride HB tarafı değişebilir).
   - Yalnızca yeni çalışıyor → `hepsiburadaOrderSync.ts`'i yeni feed'leri
     kullanacak şekilde refactor et, eskiyi `@deprecated` bırak.
   - İkisi de çalışıyor → mevcut `hepsiburadaOrderSync.ts`'e DOKUNMA (zaten
     üretimde kullanılıyor, riskli); yeni feed'leri yalnızca "durum bazlı
     hızlı filtreleme" (örn. dashboard'da "Faturasız Paketler" widget'ı) gibi
     tamamlayıcı, YENİ bir kullanım alanında devreye al — mevcut senkron
     akışını yeniden yazma.
4. Kararı `docs/HEPSIBURADA_SYNC_KARAR.md`'a yaz (tarih + hangi seçenek +
   neden), gelecekteki oturumların aynı araştırmayı tekrarlamaması için.

---

## BÖLÜM D — DB/Schema kararları

**D1) Servis Anahtarı için migration:**
`MarketplaceConnection` modelinde şu an `serviceKey` kolonu yok (env
`HB_SERVICE_KEY` ile geçici çözülüyor — TÜM store'lar için tek bir global
değer, store bazlı değil, bu üretimde yanlış). Prisma migration ekle:
```prisma
// MarketplaceConnection modeline:
serviceKeyEncrypted String?
```
`secretCrypto.ts`'teki mevcut `encryptSecret`/`decryptSecret` ile aynı
şekilde şifrele. `hepsiburadaFetch.ts` → `getHbCredentials()` içindeki
`process.env.HB_SERVICE_KEY` fallback'ini, önce DB'den okuyacak, yoksa env'e
düşecek şekilde güncelle (geriye dönük uyumluluk için env fallback'i koru).
Bağlantı ayarları formuna (muhtemelen `integrations/hepsiburada/connection`
route'unun kullandığı UI) "Servis Anahtarı (opsiyonel)" alanı ekle.

**D2) Finans verisi için DB modeli:**
Şu an `hepsiburadaFinance.ts` yalnızca fetch yapıyor, DB'ye yazmıyor. Karar:
Trendyol'daki `trendyolFinanceChe.ts`'in bağlı olduğu Prisma modelini incele
(muhtemelen genel bir `MarketplaceFinanceTransaction` benzeri model). Eğer
platform-agnostik bir model VARSA, `hepsiburadaFinance.ts`'e
`upsertHbFinanceTransaction` fonksiyonu ekleyip aynı modele yaz — yeni model
açma. Eğer yoksa, bu görevin kapsamı dışında bırak (yalnızca fetch fonksiyonu
yeterli, DB persist ayrı bir işte planlanmalı) — sahte/eksik alan eşlemesiyle
yeni bir model açıp veri kaybına yol açma riskini alma.

---

## Kabul Kriterleri

1. `docs/HEPSIBURADA_DOGRULAMA_BEKLEYEN.md` oluşturuldu, en az 7 madde içeriyor.
2. Bölüm B'de yalnızca path/method'u net olan fonksiyonlara route eklendi.
3. `npx tsc --noEmit` hatasız.
4. `docs/HEPSIBURADA_SYNC_KARAR.md` oluşturuldu, 3 seçenekten biri gerekçeyle seçildi.
5. `hepsiburadaOrderSync.ts` yalnızca Bölüm C'de açıkça karar verilirse değiştirildi.
6. Servis Anahtarı migration'ı geriye dönük uyumlu (env fallback korundu).
7. Yeni Prisma modeli yalnızca D2'de gerçek bir ihtiyaç doğrulanırsa açıldı.
