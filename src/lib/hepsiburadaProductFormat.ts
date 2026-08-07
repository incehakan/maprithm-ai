/** İstemci + sunucu güvenli HB ürün alan yardımcıları (Prisma yok). */

/** Number → HB fiyat stringi ("14,50") */
export function formatHbPrice(value: number): string {
  if (!Number.isFinite(value)) throw new Error("Geçersiz fiyat.");
  const fixed = Math.round(value * 100) / 100;
  const [intPart, frac = "00"] = fixed.toFixed(2).split(".");
  return `${intPart},${frac}`;
}

export function normalizeHbMerchantSku(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) throw new Error("merchantSku boş olamaz.");
  if (/\s/.test(s)) {
    throw new Error("merchantSku boşluk içeremez (göndermeden önce temizleyin).");
  }
  return s;
}

export type HbProductStatus =
  | "WAITING"
  | "MISSING_INFO"
  | "MATCHED"
  | "PRE_MATCHED"
  | "REJECTED"
  | "MATCHED_WITH_STAGED"
  | "CREATED";

export const HB_PRODUCT_STATUS_LABELS_TR: Record<HbProductStatus, string> = {
  WAITING: "İncelenecek",
  MISSING_INFO: "Eksik Bilgi",
  MATCHED: "Satışa Hazır",
  PRE_MATCHED: "Ön Eşleşme",
  REJECTED: "Reddedildi",
  MATCHED_WITH_STAGED: "Eşleşmiş (Staged)",
  CREATED: "Yaratıldı",
};
