# GÖREV: "[object Object]" Hata Gösterimi Buğunu Düzelt

## Kök Neden

API hata gövdesi şu şekilde dönüyor (`src/lib/errors/errorResponse.ts` →
`ApiErrorBody`):
```ts
{ success: false, error: { code, userMessage, field?, internalMessage?, details? } }
```
Alan adı **`userMessage`** — `message` DEĞİL. Ama en az 11 yerde (hepsi
`src/app/(dashboard)/hepsiburada/**/page.tsx` altında) şu hatalı desen var:

```ts
throw new Error(data?.error?.message || data?.error || "...");
```

`data.error.message` her zaman `undefined` (çünkü gerçek alan `userMessage`),
bu yüzden kod fallback olarak **tüm `data.error` objesini** `Error()`'a
veriyor. JS bir objeyi `Error()`'a verince `String(object)` çağrılır, bu da
`"[object Object]"` üretir — kullanıcının ekranda gördüğü buydu.

## Etkilenen dosyalar (bilinen 11 nokta)

- `src/app/(dashboard)/hepsiburada/questions/page.tsx` (3 yer)
- `src/app/(dashboard)/hepsiburada/products/page.tsx` (1 yer)
- `src/app/(dashboard)/hepsiburada/products/tracking/page.tsx` (2 yer)
- `src/app/(dashboard)/hepsiburada/listings/page.tsx` (3 yer)
- `src/app/(dashboard)/hepsiburada/campaigns/page.tsx` (2 yer)

## Düzeltme

Her birinde deseni şuna çevir:
```ts
throw new Error(
  data?.error?.userMessage ||
  data?.error?.internalMessage ||
  (typeof data?.error === "string" ? data.error : null) ||
  "..."  // sayfaya özel varsayılan mesaj, olduğu gibi kalsın
);
```
`internalMessage` yalnızca development ortamında dolu gelir (bkz.
`buildApiErrorBody`), production'da genelde `userMessage` yeterli olacak —
bu normal, sorun değil.

## Kapsam genişletme (ZORUNLU)

1. Aynı deseni (`data?.error?.message || data?.error`) `src/app` altında
   TÜM dosyalarda ara (Trendyol sayfaları dahil) — yukarıdaki 11 yer bir alt
   klasörde (`hepsiburada`) bulundu, aynı bug'ın Trendyol sayfalarında veya
   `src/components` altında da olup olmadığını kontrol et, varsa aynı şekilde
   düzelt.
2. Bu düzeltmeyi merkezi bir yardımcı fonksiyona çıkar — örn.
   `src/lib/apiErrorMessage.ts` (bu dosya zaten var, içeriğine bak, muhtemelen
   tam bunun için) veya yeni bir `extractApiErrorMessage(data, fallback)`
   fonksiyonu yaz. Her sayfada aynı 4 satırı tekrar tekrar yazmak yerine
   TÜM düzeltilen yerlerde bu ortak fonksiyonu kullan — böylece gelecekte
   API hata şekli değişirse tek yerden düzeltilir.

## Kabul Kriterleri

1. `npx tsc --noEmit` temiz.
2. Hiçbir sayfada artık `data?.error` (tüm obje) doğrudan `Error()`'a
   verilmiyor.
3. Ortak bir `extractApiErrorMessage` (veya benzeri) yardımcı fonksiyon var
   ve en az bu 11+ yerde kullanılıyor.
4. Hepsiburada bağlantısı olmayan bir store ile bu sayfalar açıldığında artık
   "[object Object]" değil, anlamlı bir Türkçe hata mesajı ("Aktif
   Hepsiburada bağlantısı bulunamadı..." gibi) görünüyor.
