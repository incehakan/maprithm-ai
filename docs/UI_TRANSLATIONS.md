# Arayüz Türkçeleştirme Notları

Bu dosya Görev 4 kapsamında değiştirilen İngilizce arayüz metinlerini listeler.

## Giriş adresi

- **Doğru giriş:** `/login` (ör. `http://localhost:3001/login`)
- **`/en/login` yok** — bu adres başka bir uygulamaya veya geçersiz rotaya gider; Maprithm'de dil öneki kullanılmıyor.

## Değişiklik listesi

| Dosya | Eski | Yeni |
|-------|------|------|
| `sidebar-menu-config.ts` | Dashboard | Panel |
| `sidebar-menu-config.ts` | Referans Sync Yönetimi | Referans Senkron Yönetimi |
| `Sidebar.tsx` | Commerce AI OS | Ticaret AI OS |
| `Sidebar.tsx` | Premium Commerce Workspace | Premium Ticaret Çalışma Alanı |
| `admin/layout.tsx` | System Connections | Sistem Bağlantıları |
| `admin/layout.tsx` | Reference Sync | Referans Senkronu |
| `admin/layout.tsx` | System Status | Sistem Durumu |
| `admin/layout.tsx` | Operation Test Lab | İşlem Test Laboratuvarı |
| `admin/layout.tsx` | Dashboard | Panel |
| `admin/system-connections/page.tsx` | System Connections | Sistem Bağlantıları |
| `admin/system-connections/page.tsx` | Environment | Ortam |
| `admin/system-connections/page.tsx` | Seller ID | Satıcı ID |
| `dashboard/page.tsx` | AI Commerce Control Center | AI Ticaret Kontrol Merkezi |
| `dashboard/page.tsx` | Executive Overview | Yönetici Özeti |
| `dashboard/page.tsx` | Created / Picking / Invoiced | Oluşturuldu / Hazırlanıyor / Faturalandı |
| `settings/page.tsx` | Export (sekme) | Dışa Aktarma |
| `settings/page.tsx` | Export Fallback Değerleri | Dışa Aktarma Yedek Değerleri |
| `not-found.tsx` | (yoktu) | Sayfa bulunamadı + `/login` yönlendirmesi |
| `error.tsx` | (yoktu) | Bir şeyler ters gitti |

Teknik terimler bilinçli olarak korundu: API, URL, SKU, ID, User-Agent, Stage, Production, CHE supplierId.
