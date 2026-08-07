# GÖREV: Hepsiburada — Kalan Belirsizlikleri Canlı SIT Testiyle Çöz + Ask-to-Seller UI

## Bağlam / Karar (mimar kararı, sorgulama)

Önceki turda "önce HB'ye sor, sonra kod yaz" yaklaşımı seçilmişti. Bu turda
karar değişti: **projede zaten aktif bir SIT (test) mağaza bağlantısı var —
bu tam olarak böyle belirsizlikleri çözmek için var.** HB'ye e-posta atıp
beklemek yerine, aşağıdaki adımları UYGULA ve gerçek sonuçlara göre kodu
kesinleştir. Placeholder/TODO bırakma disiplini AYNI KALIYOR — ama artık
"bilmiyorum, sor" yerine "denedim, gerçek sonuç şu" ile kapatılacak.

Güvenlik: tüm testler SIT (test) ortamında, gerçek üretim verisini etkilemeyen
uçlarda yapılacak (test siparişi/test talep stub'ları zaten mevcut —
`hepsiburadaTestOrder.ts`, `hepsiburadaReturns.ts` → `createHbTestClaim`).
Gerçek prod endpoint'lerine ASLA test isteği atma.

---

## 1) Sync çelişkisini şimdi çöz (önceki Bölüm C'nin ertelenen kısmı)

`admin/test-lab` altındaki mevcut test mağaza akışını kullanarak (yeni bir
şey kurma), aktif SIT bağlantısı olan bir store bul. Bir Node script veya
geçici bir `test-lab` route ile şunu çalıştır:

1. `fetchHbPackagesPage` (eski, `hepsiburadaOrderSync.ts`) çağır, sonucu logla.
2. `hepsiburadaStatusFeeds.ts`'teki 8 fonksiyonun her birini çağır, sonucu logla.
3. İkisi de veri dönüyorsa (200 + makul içerik), `HEPSIBURADA_SYNC_KARAR.md`'ı
   güncelle: "İkisi de çalışıyor doğrulandı (tarih). Karar DEĞİŞMEDİ: eski
   senkron akışı üretimde kalıyor, statü-feed'ler tamamlayıcı kullanım için
   (örn. dashboard widget'ları) serbest." — kod DEĞİŞTİRME, yalnızca kararı
   canlı veriyle teyit et.
4. Biri 404/410/hata dönüyorsa, `HEPSIBURADA_SYNC_KARAR.md`'a hangisinin
   çalışmadığını yaz ve çalışmayan tarafı `@deprecated` işaretle (silme).
5. Test scripti/route'u geçiciyse iş bitince kaldır — kalıcı bir "debug"
   endpoint'i production'a sızdırma.

---

## 2) `HEPSIBURADA_DOGRULAMA_BEKLEYEN.md`'deki 7 maddeyi TEK TEK canlı test et

Her madde için: SIT ortamında, geçerli auth ile, **minimum/dummy body** ile
gerçek isteği at, HTTP status + hata mesajını/başarılı yanıtı logla.

**Her madde için karar mantığı (bunu uygula, sorma):**

- **200/204 başarılı** → gerçek body/method doğrulandı, kodu buna göre
  kesinleştir, TODO'yu kaldır, JSDoc'a "canlı SIT ile doğrulandı (tarih)" yaz.
- **400 (validasyon hatası)** → HB'nin hata mesajı genelde eksik/yanlış alanı
  söyler (örn. "InvoiceLink is required"). Mesajdaki alan adlarıyla body'yi
  düzelt, tekrar dene. 2-3 denemede çözülmezse madde 3'e düş.
- **404/405** → path veya method yanlış; path'teki segment sırasını/harflerini
  (büyük-küçük) tekrar kontrol et, `merchantid` vs `merchantId` gibi vaka
  farklarına dikkat et (kullanıcının orijinal listesinde bazı endpoint'lerde
  bu fark VARDI — bkz. test siparişi `merchantId` segmenti).
- **401/403** → auth sorunlu olabilir, mevcut Basic Auth'u değiştirme, sadece
  logla ve madde 3'e düş (bu, kod ile çözülemez, gerçekten HB desteği gerekir).
- **Hiçbir mantıklı sonuca varılamıyorsa (3.)** → o madde
  `HEPSIBURADA_DOGRULAMA_BEKLEYEN.md`'de `[ ] Bekliyor — HB desteği gerekli`
  olarak KALSIN, kodda placeholder olarak dursun. Bunu SEN (Cursor) karar
  ver, kullanıcıya sorma — kullanıcı teknik detaya giremiyor.

Özellikle şu 3 madde muhtemelen tamamen bu yöntemle çözülür (deneysel,
düşük risk): Tedarikçi `/search` endpoint'lerinin method'u, paket işlemleri
(parcel-info/warehouse/split/laborcost) body alanları, Ask-to-Seller
`/issues` POST'unun gerçek işlevi (boş/minimal body ile dene, dönen yanıtın
şeklinden ne işe yaradığını çıkar).

---

## 3) Ask-to-Seller UI ekle (mimar kararı: yapılsın)

Mevcut iade ekranı (`returns/hepsiburada`) sayfasının desenini birebir
kopyala — yeni bir tasarım sistemi icat etme:

- Liste sayfası: `fetchHbAskToSellerIssues` + `fetchHbAskToSellerIssuesCount`
  (üstte "X bekleyen soru" rozeti).
- Satır tıklanınca detay: `fetchHbAskToSellerIssueByNumber`.
- İki aksiyon butonu: "Cevapla" (`answerHbAskToSellerIssue`, metin kutusu),
  "Reddet" (`rejectHbAskToSellerIssue`, onay diyaloğu — mevcut
  `returns/[id]/reject` UI'ındaki onay deseniyle aynı).
- Sidebar'a Hepsiburada altına "Sorular" linki ekle (Kampanyalar/Ürünler
  yanına, mevcut sidebar deseninde).
- Route'lar: `integrations/hepsiburada/ask-to-seller` (liste+count zaten
  eklenmişti, kontrol et), `integrations/hepsiburada/ask-to-seller/[number]/answer`,
  `.../reject`.

Madde 2'de bu servisin auth'unun Basic Auth ile çalışıp çalışmadığı test
edilecek — 401 dönerse bu UI'ı bir "yakında" rozetiyle devre dışı bırak,
çökmesin.

---

## Kabul Kriterleri

1. `HEPSIBURADA_SYNC_KARAR.md` canlı test sonucuyla güncellendi (tahmin değil).
2. `HEPSIBURADA_DOGRULAMA_BEKLEYEN.md`'deki 7 maddeden mümkün olan kadarı
   `[x] Doğrulandı` oldu, geri kalanı net "HB desteği gerekli" notuyla kaldı.
3. Ask-to-Seller UI eklendi (veya auth 401 ise "yakında" ile devre dışı).
4. `npx tsc --noEmit` temiz.
5. Kullanıcıya (patron) hiçbir teknik soru YÖNELTİLMEDİ — kararlar bu
   dosyadaki mantıkla otomatik verildi.
