# GÖREV: Hepsiburada OMS Entegrasyonunu SIT Endpoint Listesiyle Tamamla ve Düzelt

## Bağlam

`src/lib/hepsiburadaFetch.ts`, `hepsiburadaOrderActions.ts` ve `hepsiburadaShipping.ts`
dosyalarında önceki oturumlarda birçok endpoint **"DOĞRULANAMADI" / "UYGULANMAMIŞ"**
notuyla bilerek eksik bırakılmıştı (path'i kesin teyit edilemediği için sahte
endpoint'e istek atıp üretim sipariş akışını bozmamak adına).

Aşağıda **developers.hepsiburada.com SIT (test) ortamından doğrulanmış tam URL
listesi** var. Bu liste, dosyalardaki eksik/şüpheli noktaların gerçek kaynağı.
Görev: bu listeye göre (a) yanlış path'leri düzelt, (b) eksik fonksiyonları
implemente et, (c) çelişkileri raporla.

`.cursorrules` dosyasındaki kurallara uy: TypeScript strict, try-catch +
`logger`, mevcut `hbFetch` / `hbPostJson` / `hbPutJson` / `hbDelete` /
`hbPostFormData` katmanını kullan (yeni bir HTTP client yazma), Türkçe JSDoc
yorumlarla kaynağı ve doğrulama tarihini belirt (mevcut dosyalardaki üslup).

---

## 1) KRİTİK DÜZELTME — Fatura Linki path'i YANLIŞ

`hepsiburadaOrderActions.ts` → `sendHbInvoiceLink()` şu an şunu kullanıyor:
```
POST /packages/merchantid/{merchantId}/packagenumber/{packageNumber}/invoice-link
```
Doğrulanmış gerçek path (`-link` son eki YOK):
```
POST https://oms-external-sit.hepsiburada.com/packages/merchantid/{merchantId}/packagenumber/{packageNumber}/invoice
```
**Yapılacak:** `path` değişkenindeki `/invoice-link` → `/invoice` olarak düzelt.
Dosya başındaki "DOĞRULANAMADI" uyarı bloğunu da güncelle/kaldır (artık
doğrulanmış SIT URL'i var; body şekli hâlâ tahmini olduğu için `invoiceNumber`
/ `invoiceUrl` alan adlarını olduğu gibi bırak ama not olarak "path doğrulandı,
body şekli hâlâ teyit bekliyor" yaz).

---

## 2) Daha önce UYGULANMAMIŞ olarak bırakılan 2 fonksiyonu artık implement et

`hepsiburadaOrderActions.ts` dosyasının sonundaki yorum satırına alınmış blok:

**a) Paket kargo firması değiştirme (PUT)** — path artık doğrulandı:
```
PUT https://oms-external-sit.hepsiburada.com/packages/merchantid/{merchantId}/packagenumber/{packageNumber}/changecargocompany
```
`fetchHbChangeableCargoCompanies` (GET .../changablecargocompanies) zaten var
ve dönen `ShortName` bu PUT'un body'sinde kullanılacak. `hbPutJson` ile
`changeHbPackageCargoCompany(params: { storeId, packageNumber, cargoCompanyShortName })`
fonksiyonunu gerçek implementasyona çevir (yorumdan çıkar).

**b) Aynı pakete konabilecek kalemleri listeleme (GET)** — path artık doğrulandı:
```
GET https://oms-external-sit.hepsiburada.com/lineitems/merchantid/{merchantId}/packageablewith/lineitemid/{lineItemId}
```
`fetchHbPackageableWithLineItems(params: { storeId, lineItemId })` fonksiyonunu
`hbFetch` ile gerçek implementasyona çevir (yorumdan çıkar). Dokümantasyon notu:
beraber paketlenebilecek kalem yoksa 404 dönebilir — bunu hata değil, boş liste
olarak ele al (`res.status === 404` → `{ ok: true, data: [] }`).

---

## 3) Yeni dosya: `src/lib/hepsiburadaPackageOps.ts`

Aşağıdaki, henüz hiçbir dosyada karşılığı olmayan paket/kalem işlemlerini
buraya topla (mevcut `hepsiburadaOrderActions.ts` zaten büyük, karıştırma):

| Fonksiyon | Method | Path |
|---|---|---|
| `updateHbParcelInfo` (koli/desi güncelleme) | PUT | `/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/parcel-info` |
| `updateHbPackageWarehouse` (depo bilgisi güncelleme) | PUT | `/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/warehouse` |
| `splitHbPackage` (paketi böl) | POST | `/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/split` |
| `listHbPackages` (genel paket listesi, filtresiz) | GET | `/packages/merchantid/{merchantId}` |
| `updateHbLineItemLaborCost` (kalem işçilik maliyeti) | PUT | `/lineitems/merchantid/{merchantId}/orderlineid/{id}/laborcost` |

Method'lar (PUT/POST) isimlendirmeden mantıksal çıkarım — HB Try It! panelinden
veya ilk gerçek çağrıdan sonra teyit edilmeli; 405 dönerse method'u değiştir ve
bu dosyaya not düş.

Her fonksiyon dönüş tipi: `{ ok: true; data: unknown } | { ok: false; message: string }`
(mevcut dosyalardaki desenle birebir aynı — bkz. `fetchHbChangeableCargoCompanies`).
`packageNumber` parametresi her zaman `extractHbPackageNumber()` ile DB
kaydından çıkarılmalı (guid değil, gerçek HB packageNumber) — çağıran route'lara
bunu JSDoc'ta hatırlat.

---

## 4) Yeni dosya: `src/lib/hepsiburadaOrderLineCargo.ts`

Sipariş kaleminin (paketlemeden ÖNCEKİ aşamada, kalem seviyesinde) kargo
firması değişikliği — bu, paket seviyesindeki `changecargocompany`'den
**farklı bir akış**, karıştırma:

| Fonksiyon | Method | Path |
|---|---|---|
| `fetchHbChangeableCargoCompaniesByOrderLine` | GET | `/delivery/changeablecargocompanies/merchantid/{merchantId}/orderlineid/{orderLineId}` |
| `changeHbOrderLineCargoCompany` | PUT | `/lineitems/merchantid/{merchantId}/orderlineid/{id}/cargocompany` |

Not: Bu, `fetchHbChangeableCargoCompanies` (paket bazlı, OMS base) ile aynı işi
farklı seviyede yapıyor gibi görünüyor — JSDoc'ta ikisi arasındaki farkı
(kalem vs paket, hangi sipariş durumunda hangisi kullanılmalı) açıkça yaz;
kesin değilse "TODO: HB destek ile teyit edilmeli" notu bırak.

---

## 5) Yeni dosya: `src/lib/hepsiburadaOrderDetail.ts`

| Fonksiyon | Method | Path |
|---|---|---|
| `fetchHbOrderDetail` (sipariş numarasına göre detay) | GET | `/orders/merchantid/{merchantId}/ordernumber/{orderNumber}` |
| `fetchHbPackageDetail` (paket numarasına göre kargo/detay bilgisi) | GET | `/packages/merchantid/{merchantId}/packagenumber/{packagenumber}` |

`fetchHbPackageDetail` hem "Paket İçin Kargo Bilgilerini Listeleme" hem
"Paket Süreçleri" bölümünde aynı URL ile geçiyor — tek fonksiyon yeterli, iki
farklı isimle sarmalama.

---

## 6) Yeni dosya: `src/lib/hepsiburadaStatusFeeds.ts` — Statü bazlı listeleme

**ÖNEMLİ ÇELİŞKİ — önce bunu çöz:** `hepsiburadaOrderSync.ts` şu an
`GET /packages/merchantid/{merchantId}/packages` (sonunda EK `/packages`
segmenti var, `status` query param'ı ile filtreleniyor) kullanıyor. Aşağıdaki
doğrulanmış liste ise `status` query param'ı yerine **her statü için ayrı,
dedike bir path** öneriyor ve `/packages` son eki YOK:

```
GET /orders/merchantid/{merchantId}                    (tüm siparişler)
GET /orders/merchantid/{merchantId}/cancelled
GET /orders/merchantid/{merchantId}/paymentawaiting
GET /packages/merchantid/{merchantId}/delivered
GET /packages/merchantid/{merchantId}/missing-invoice
GET /packages/merchantid/{merchantId}/shipped
GET /packages/merchantid/{merchantId}/status/unpacked
GET /packages/merchantid/{merchantId}/undelivered
```

Bu iki şema (query-param filtresi vs. dedike path) muhtemelen **AYNI ANDA
GEÇERLİ DEĞİL** — HB dokümantasyonunda hangisi güncel, belirsiz. Bunu
otomatik "düzeltme" yapıp mevcut senkron akışını kırma. Bunun yerine:

1. Yukarıdaki 8 endpoint için `hepsiburadaStatusFeeds.ts` içinde ayrı,
   bağımsız fonksiyonlar yaz (`fetchHbOrdersAll`, `fetchHbOrdersCancelled`,
   `fetchHbOrdersPaymentAwaiting`, `fetchHbPackagesDelivered`,
   `fetchHbPackagesMissingInvoice`, `fetchHbPackagesShipped`,
   `fetchHbPackagesUnpacked`, `fetchHbPackagesUndelivered`) — hepsi offset/limit
   destekli, `hbFetch` ile.
2. `hepsiburadaOrderSync.ts`'e DOKUNMA — mevcut `/packages` + `status` query
   akışı hâlâ çalışıyor olabilir (muhtemelen daha eski/genel bir endpoint).
3. Dosya başına şu notu ekle: "Bu dosyadaki dedike-path endpoint'ler ile
   `hepsiburadaOrderSync.ts`'teki query-param'lı `/packages/merchantid/{id}/packages`
   endpoint'i arasındaki ilişki doğrulanmadı — muhtemelen ikisi de var ama
   hangisinin daha güncel/önerilen olduğu HB dokümantasyonundan teyit
   edilmeli. Üretimde her iki yaklaşımı da yeniden yazan bir 'birleştirme'
   yapmadan önce canlı hesapla test edilmeli."

---

## 7) Yeni dosya: `src/lib/hepsiburadaTestOrder.ts` — Test Siparişi Oluşturma

**Dikkat: FARKLI BASE URL** — `HB_BASE` sabitlerine yeni bir anahtar eklenmeli:

```ts
// hepsiburadaFetch.ts içindeki HB_BASE objesine ekle:
OMS_STUB_SIT: "https://oms-stub-external-sit.hepsiburada.com",
```

Bu base, yalnızca SIT/test ortamında var olan bir "stub" servis gibi görünüyor
(prod karşılığı muhtemelen yok — sadece entegrasyon testinde sahte sipariş
üretmek için). `hbBaseUrl()` fonksiyonunda `environment === "test"` dışında
bu anahtarın çağrılmasını engelleyecek bir guard ekle (production'da
çağrılırsa açık hata fırlat: "Test siparişi oluşturma yalnızca SIT ortamında
kullanılabilir.").

Endpoint:
```
POST https://oms-stub-external-sit.hepsiburada.com/orders/merchantId/{merchantId}
```
(Not: path segmenti `merchantId` — diğer tüm endpoint'lerdeki küçük harfli
`merchantid`'den farklı, büyük/küçük harf duyarlılığını olduğu gibi koru.)

`createHbTestOrder(params: { storeId, orderPayload })` fonksiyonu yaz, sadece
`environment === "test"` iken çalışsın, body şekli için HB dokümantasyonundaki
örnek payload'ı ara (bulunamazsa minimal bir iskelet + "TODO: body şeması
teyit edilmeli" notuyla bırak).

---

## 8) Zaten doğru olan / dokunma

Aşağıdakiler mevcut kodda zaten doğrulanmış path'lerle implement edilmiş,
listendeki URL'lerle birebir eşleşiyor — **değiştirme, sadece JSDoc'a "SIT
listesiyle teyit edildi (tarih)" notu ekle**:

- `sendHbCancelAction` → `POST /lineitems/merchantid/{merchantId}/id/{lineId}/cancelbymerchant` ✅
- `sendHbShippedAction` / `sendHbUndeliverAction` → `.../deliver` / `.../undeliver` ✅
- `sendHbUnpackAction` → `.../unpack` ✅
- `createHbPackage` → `POST /packages/merchantid/{merchantId}` ✅
- `fetchHbChangeableCargoCompanies` → `.../changablecargocompanies` ✅
- `fetchHbCargoLabel` (hepsiburadaShipping.ts) → `.../labels` ✅

## 9) Yeni: "Mağaza Hesabı" `intransit` bildirimi

`sendHbShippedAction` / `sendHbUndeliverAction` yanına, aynı dosyada
(`hepsiburadaOrderActions.ts`), "Mağaza Hesabı" (kendi kargon) modeli için
üçüncü bir statü daha ekle:
```
POST /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/intransit
```
`sendHbIntransitAction(params: { storeId, packageNumber })` — deliver/undeliver
ile birebir aynı desende (body yok, `hbPostJson(..., {})`).

---

## Kabul Kriterleri

1. `npx tsc --noEmit` hatasız geçmeli.
2. Her yeni/düzeltilen fonksiyon: JSDoc'ta method + tam path + "SIT listesiyle
   doğrulandı (03.08.2026)" notu.
3. `hepsiburadaOrderSync.ts`'e dokunulmadı (madde 6'daki çelişki sadece
   raporlandı, sessizce "düzeltilmedi").
4. `invoice-link` → `invoice` path düzeltmesi yapıldı.
5. Yorum satırındaki 2 fonksiyon (changecargocompany PUT, packageablewith GET)
   gerçek implementasyona çevrildi.
6. Yeni dosyalar mevcut `hbFetch` / `hbPostJson` / `hbPutJson` katmanını
   kullanıyor, yeni bir fetch wrapper icat edilmedi.
7. Test siparişi oluşturma fonksiyonu production'da çağrılırsa açıkça hata
   veriyor.
