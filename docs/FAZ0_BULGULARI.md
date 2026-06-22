# Faz 0 Bulguları

Bu doküman Faz 0 salt-okunur denetim ve doğrulama çıktılarını içerir.

## 1. Ortam Doğrulaması

### Ortam seçimi kaynağı

| Katman | Dosya | Kaynak | Varsayılan |
|--------|-------|--------|------------|
| Mağaza (store) API çağrıları | `src/lib/trendyolFetch.ts` | `MarketplaceConnection.environment` (`"stage"` \| `"production"`) | Geçersiz değerde `"production"` |
| Sistem referans senkronu | `src/lib/trendyolSystemFetch.ts` | `SystemMarketplaceConnection.environment` | Geçersiz değerde `"production"` |

Her iki modülde `getBaseUrl()` aynı mantığı kullanır:

- `stage` → `https://stageapigw.trendyol.com`
- `production` → `https://apigw.trendyol.com`

Ortam **env var ile override edilmiyor**; tamamen DB'deki bağlantı kaydından geliyor.

### Ek header'lar (ortamdan bağımsız)

- `TRENDYOL_FALLBACK_CLIENT_IP` — `x-clientip` (varsayılan `127.0.0.1`)
- `TRENDYOL_AGENT_NAME` — `x-agentname` (store: `Maprithm`, sistem: `Maprithm-System`)

### STAGE'de V2 / origin denemeleri için

1. İlgili mağazanın `MarketplaceConnection` kaydında `environment = "stage"` olmalı (UI veya doğrudan DB).
2. Sistem referans senkronu için `SystemMarketplaceConnection.environment = "stage"` gerekir.
3. Menşei lookup endpoint'i (`/integration/ecgw/v1/{sellerId}/lookup/origins`) aynı base URL üzerinden stage'de de erişilebilir.
4. Feature flag (`Store.featureFlags.origin_field_enabled`) açılmadan origin payload/UI davranışı değişmez.

**Sonuç:** Ortam ayrımı doğru yapılandırılmış; STAGE testleri için ek kod değil, bağlantı kayıtlarında `environment` alanının `stage` yapılması yeterli.

## 2. Test Kapsamı Envanteri

### Mevcut durum

- `*.test.ts`, `*.spec.ts` dosyası **yok**
- `jest.config.*`, `vitest.config.*` **yok**
- `package.json` içinde test script'i veya test runner bağımlılığı **yok**

**Sonuç:** Otomatik test altyapısı bulunmuyor.

### Faz 1+ için önerilen kritik test path'leri

| Alan | Öncelik | Neden |
|------|---------|-------|
| `buildTrendyolCreateProductItem` / V2 payload mapping | Yüksek | V1→V2 geçişinde alan adı ve şema değişiklikleri |
| `extractBatchRequestId` + batch sonuç parse | Yüksek | Yayın sonrası durum takibi |
| `normalizeLineVatBase` ve sipariş satır normalizasyonu | Yüksek | Production API alan rename'leri (vatRate) |
| Trendyol hata kodu → internal kod haritalama | Orta | Kullanıcıya doğru hata mesajı |
| `validateProductForTrendyolPublish` | Orta | Yayın öncesi local validasyon regresyonu |
| `isFeatureEnabled` + flag kapalıyken payload davranışı | Orta | Geriye dönük uyumluluk |

Faz 0'da `normalizeLineVatBase` için `scripts/manual-test-vat-rate.js` ile manuel doğrulama yapıldı (test runner olmadığı için).

## 3. Origin Alanı Doğrulaması

Kaynak: [Ürün Aktarma V1 (createProducts)](https://developers.trendyol.com/docs/ürün-aktarma-v2createproducts), [Menşei Değerleri Listesi](https://developers.trendyol.com/docs/ürün-menşei-değerleri.md), [Menşei Listesi API](https://developers.trendyol.com/reference/autoft-get-origins), changelog 13.05.2026.

### createProducts (V1) — `origin` alanı

| Özellik | Değer |
|---------|-------|
| Konum | `items[]` dizisindeki **her ürün satırının kökü** (variant/barcode başına; `attributes` ile aynı seviye) |
| Veri tipi | `string` |
| Format | 2 harfli ülke kodu (ör. `"TR"`, `"AD"`) — max 2 karakter |
| Zorunluluk | Şu an **opsiyonel**; **30 Haziran 2026** itibarıyla zorunlu olacak |

Örnek request gövdesi (tek item):

```json
{
  "items": [
    {
      "barcode": "barkod-1234",
      "title": "Bebek Takımı Pamuk",
      "productMainId": "1234BT",
      "brandId": 1791,
      "categoryId": 411,
      "quantity": 100,
      "stockCode": "STK-345",
      "origin": "AD",
      "dimensionalWeight": 2,
      "description": "Ürün açıklama bilgisi",
      "currencyType": "TRY",
      "listPrice": 250.99,
      "salePrice": 120.99,
      "vatRate": 18,
      "cargoCompanyId": 10,
      "images": [{ "url": "https://example.com/img.jpg" }],
      "attributes": []
    }
  ]
}
```

Endpoint: `POST /integration/product/sellers/{sellerId}/products`  
Stage: `https://stageapigw.trendyol.com/integration/product/sellers/{sellerId}/products`  
Production: `https://apigw.trendyol.com/integration/product/sellers/{sellerId}/products`

### Menşei Değerleri Listesi

- **Statik referans (V1 kodları):** [ürün-menşei-değerleri](https://developers.trendyol.com/docs/ürün-menşei-değerleri.md) — `code` (2 harf) + Türkçe `name` tablosu (ör. `TR` → Türkiye).
- **API referans servisi (lookup):**

| | |
|--|--|
| Method | `GET` |
| Path | `/integration/ecgw/v1/{sellerId}/lookup/origins` |
| Stage base | `https://stageapigw.trendyol.com/integration/ecgw` |
| Production base | `https://apigw.trendyol.com/integration/ecgw` |
| Auth | Basic (API Key + Secret), zorunlu header'lar: `x-clientip`, `x-correlationid`, `x-agentname` |

Örnek response:

```json
{
  "items": [
    { "name": "Almanya" },
    { "name": "Türkiye" }
  ]
}
```

**Not:** API yanıtı yalnızca Türkçe `name` döner; V1 `createProducts` payload'ı ise 2 harfli `code` bekler. Uygulama kod eşlemesini resmi statik listeyle yapar; API çağrısı isim doğrulama / senkron için kullanılır.

### Zorunlu kategori tespiti (uygulama)

Menşei zorunluluğu, seçili kategorinin `TrendyolCategoryAttribute` kayıtlarında **zorunlu** ve adı `Menşei` / `origin` olan attribute varlığıyla tespit edilir (`categoryRequiresOrigin`).
