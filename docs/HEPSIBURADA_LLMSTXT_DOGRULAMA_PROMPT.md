# GÖREV: llms.txt Üzerinden Doküman-Bazlı Doğrulama (canlı bağlantı BEKLEMEDEN)

## Bağlam

Hepsiburada'nın `https://developers.hepsiburada.com/llms.txt` adresinde,
yapay zeka ajanları için hazırlanmış, TÜM API referans sayfalarının
markdown formatındaki linklerini içeren bir indeks var. Bu, SIT bağlantısı
olmadan da resmi dokümantasyonu tarayarak birçok belirsizliği çözmemizi
sağlar. SIT canlı testi (önceki `HEPSIBURADA_CANLI_TEST_VE_KARAR_PROMPT.md`)
hâlâ geçerli ve gerekli — ama bu doküman taraması ONDAN ÖNCE yapılmalı,
çünkü çoğu soru dokümanla çözülüp canlı testte sadece TEYİT edilecek.

İlk adım: `https://developers.hepsiburada.com/llms.txt` adresini çek, tam
listeyi al. Sonra aşağıdaki başlıklardaki sayfaları TEK TEK aç ve oku.

## Öncelikli sayfalar (7 belirsizlik maddesiyle eşleşen)

- `.../reference/put_packages-merchantid-merchantid-packagenumber-packagenumber-parcel-info` → koli/desi güncelleme body şeması
- `.../reference/put_packages-merchantid-merchantid-packagenumber-packagenumber-warehouse` → depo güncelleme body şeması
- `.../reference/put_packages-merchantid-merchantid-packagenumber-packagenumber-changecargocompany` → kargo değiştirme body (muhtemelen `ShortName` alanı — teyit et)
- `.../reference/post_packages-merchantid-merchantid-packagenumber-packagenumber-split` → paket bölme body şeması
- `.../reference/put_lineitems-merchantid-merchantid-orderlineid-id-laborcost` → işçilik maliyeti body (NOT: dokümana göre yalnızca ALTIN ürünler için geçerli — bu kısıtı koda ekle)
- `.../reference/soru-oluşturma` → Ask-to-Seller "POST /issues" ikilemi ÇÖZÜLDÜ: bu, GET listeden AYRI, yalnızca SIT'te çalışan bir "test sorusu oluşturma" endpoint'i. `hepsiburadaAskToSeller.ts`'e `createHbTestQuestion` olarak ekle (SIT-only guard, `hepsiburadaTestOrder.ts` deseniyle aynı).
- `.../reference/teklif-oluşturma`, `.../reference/açık-siparişleri-listeleme`, `.../reference/envanter-bilgilerini-listeleme` → Tedarikçi `/search` endpoint'lerinin gerçek method'u (GET/POST)

Ayrıca oku: `.../reference/soru-cevaplama` (answer body şeması),
`.../reference/sorun-bildirme` (reject/reddet — muhtemelen bizim
`rejectHbAskToSellerIssue` bu endpoint'e karşılık geliyor, path'i teyit et).

## Uygulama

Her sayfadan çıkan gerçek body şemasını ilgili lib fonksiyonuna işle,
JSDoc'a "resmi dokümantasyondan doğrulandı (tarih) — path/body; canlı SIT
testiyle henüz TEYİT EDİLMEDİ" notu ekle (iki aşamalı doğrulama: önce
doküman, sonra canlı test — ikisi ayrı, birini diğeriyle karıştırma).

`HEPSIBURADA_DOGRULAMA_BEKLEYEN.md`'yi güncelle: doküman ile çözülen
maddeler `[x] Dokümanla doğrulandı — canlı test bekliyor` olsun (tam
`[x] Doğrulandı` DEĞİL, çünkü gerçek istekle henüz denenmedi).

## Kabul Kriterleri

1. 7 maddeden mümkün olduğunca çoğu "dokümanla doğrulandı" seviyesine geldi.
2. Ask-to-Seller `createHbTestQuestion` eklendi, SIT-only guard var.
3. Laborcost fonksiyonuna "yalnızca altın ürünler" kısıtı JSDoc'a eklendi.
4. `npx tsc --noEmit` temiz.
5. Hiçbir madde gerçek canlı istek atılmadan "tam doğrulandı" işaretlenmedi
   — bu ayrım korundu.
