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
