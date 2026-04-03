/**
 * Trendyol Marketplace ürün aktarımı (createProducts) için cargoCompanyId — yaygın seçenekler.
 * Kaynak: Trendyol Partner API “kargo şirketleri / shipment providers” dokümantasyonu.
 * Anlaşmanıza göre panelde aktif olmayan firmalar reddedilebilir; ID’leri panelden teyit edin.
 */
export const TRENDYOL_MP_CARGO_PRESETS: readonly { id: number; label: string }[] = [
  { id: 4, label: "Yurtiçi Kargo Marketplace" },
  { id: 7, label: "Aras Kargo Marketplace" },
  { id: 6, label: "Horoz Kargo Marketplace" },
  { id: 10, label: "DHL eCommerce Marketplace" },
  { id: 19, label: "PTT Kargo Marketplace" },
  { id: 9, label: "Sürat Kargo Marketplace" },
  { id: 17, label: "Trendyol Express Marketplace" },
  { id: 20, label: "CEVA Marketplace" },
  { id: 30, label: "Ceva Tedarik Marketplace" },
  { id: 38, label: "Kolay Gelsin Marketplace" }
] as const;

const LABEL_BY_ID = new Map<number, string>(
  TRENDYOL_MP_CARGO_PRESETS.map((p) => [p.id, p.label])
);

export function trendyolCargoPresetLabel(id: number): string | undefined {
  return LABEL_BY_ID.get(id);
}
