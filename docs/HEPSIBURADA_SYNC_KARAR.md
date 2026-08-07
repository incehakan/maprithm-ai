# Hepsiburada — Order Sync vs Status Feeds Kararı

Tarih: 2026-08-03 (canlı deneme güncellemesi)

## İki yüzey

| Yaklaşım | Path | Kod |
|---|---|---|
| Eski (üretim sync) | `GET /packages/merchantid/{merchantId}/packages?status=&offset=&limit=` | `hepsiburadaOrderSync.ts` |
| Yeni (dedike path) | `/delivered`, `/shipped`, `/undelivered`, `/status/unpacked`, `/missing-invoice`, … | `hepsiburadaStatusFeeds.ts` |

## Canlı SIT denemesi (2026-08-03)

Komut: `npx tsx scripts/hb-sit-live-verify.ts`

**Sonuç:** Çalıştırılamadı.

```json
{
  "fatal": true,
  "reason": "NO_HB_SIT_CONNECTION",
  "message": "Aktif Hepsiburada SIT (environment=test) bağlantısı yok."
}
```

Veritabanı durumu (aynı gün):
- Store: 1 aktif mağaza
- `MarketplaceConnection`: yalnızca `platform=trendyol` (production)
- `platform=hepsiburada` kaydı: **0** (aktif/pasif hiç yok)

Bu yüzden eski packages query ile yeni status-feed’ler **karşılaştırılamadı**
(tahmin değil; credential yokluğu ölçümü).

## Güncel karar (değişmedi — seçenek 3)

Canlı A/B yapılana kadar:
- `hepsiburadaOrderSync.ts`’e **dokunulmaz**
- Status-feed’ler tamamlayıcı yüzey olarak kalır (`/api/orders/hepsiburada/status-feed/[status]`)
- Kodda `@deprecated` işaretlenmedi (hangi tarafın öldüğü bilinmiyor)

## Tekrar nasıl çalıştırılır

1. Ayarlar → Hepsiburada → Ortam = **Test / SIT**, API bilgilerini kaydet, bağlantıyı aktif et
2. `npx tsx scripts/hb-sit-live-verify.ts`
3. Çıktıdaki `sync_old_packages_query` + `feed_*` satırlarına göre bu dosyayı güncelle:
   - İkisi de ok → seçenek 3 teyit
   - Yalnızca biri ok → çalışan kalsın, diğerine `@deprecated`
