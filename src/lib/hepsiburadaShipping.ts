/**
 * Hepsiburada kargo servisi.
 *
 * KAYNAK: developers.hepsiburada.com resmi API referansı (2026-08-02
 * doğrulandı). Bu dosya önceki oturumda tahmini path'lerle yazılmıştı ve
 * hiçbir yerden çağrılmıyordu (ölü kod) — bu oturumda dokümana göre
 * düzeltildi. NOT: hepsiburadaOrderActions.ts'deki
 * fetchHbChangeableCargoCompanies fonksiyonuyla işlevsel çakışma var; kargo
 * firması sorgulama için o dosya tercih edilmelidir (zaten doğrulanmış ve
 * kullanımda). Bu dosya yalnızca kargo ETİKETİ alma için tutuluyor.
 *
 * Doğrulanmış endpoint:
 *   GET {OMS}/packages/merchantid/{merchantId}/packagenumber/{packagenumber}/labels
 *   ("Ortak Barkod Oluşturma") — SIT listesiyle teyit edildi (03.08.2026).
 *
 * UYGULANMADI (doğrulanamadı, önceki implementasyonda tahminiydi):
 *   - Kargo firması listesi: gerçek endpoint hepsiburadaOrderActions.ts'deki
 *     fetchHbChangeableCargoCompanies (.../changablecargocompanies) —
 *     buradaki eski "/cargo-companies" path'i YANLIŞTI, kaldırıldı.
 *   - Takip numarası güncelleme: HB dokümantasyonunda böyle bir endpoint
 *     bulunamadı (muhtemelen paketleme sırasında kargo firması otomatik
 *     entegre oluyor, ayrı bir "tracking" PUT'u yok) — kaldırıldı.
 */

import { hbFetch, getHbMerchantId } from "@/lib/hepsiburadaFetch";

// ─── Kargo etiketi al (DOĞRULANMIŞ) ──────────────────────────────────────────
// Method: GET
// Path: /packages/merchantid/{merchantId}/packagenumber/{packagenumber}/labels
// SIT listesiyle doğrulandı (03.08.2026).
// packageNumber = HB packageNumber (DB guid'i DEĞİL — extractHbPackageNumber).

export async function fetchHbCargoLabel(params: {
  storeId: string;
  packageNumber: string;
}): Promise<{ ok: true; labelUrl: string } | { ok: false; message: string }> {
  const merchantId = await getHbMerchantId(params.storeId);
  const path = `/packages/merchantid/${encodeURIComponent(merchantId)}/packagenumber/${encodeURIComponent(params.packageNumber)}/labels`;

  const res = await hbFetch<unknown>(params.storeId, "OMS", path);
  if (!res.ok) return { ok: false, message: res.message };

  const d = res.data;
  const record = Array.isArray(d) ? (d[0] as Record<string, unknown> | undefined) : (d as Record<string, unknown>);
  const labelUrl =
    (typeof record?.labelUrl === "string" ? record.labelUrl : null) ??
    (typeof record?.label === "string" && record.label.startsWith("http") ? record.label : null) ??
    (typeof record?.url === "string" ? record.url : null) ??
    (typeof record?.barcode === "string" ? record.barcode : null);

  if (!labelUrl) return { ok: false, message: "Kargo etiketi/barkod bulunamadı." };
  return { ok: true, labelUrl };
}
