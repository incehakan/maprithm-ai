import type { MarketplaceSyncStatus } from "./types";

export type MarketplaceSyncBadge =
  | "xml_ok"
  | "trendyol_ok"
  | "trendyol_pending"
  | "trendyol_failed"
  | "not_linked";

export function resolveMarketplaceSyncBadge(
  status: string | null | undefined,
  hasTrendyolMapping: boolean
): MarketplaceSyncBadge {
  if (!hasTrendyolMapping) return "not_linked";
  const s = (status ?? "").toUpperCase();
  if (s === "SYNCED") return "trendyol_ok";
  if (s === "FAILED") return "trendyol_failed";
  if (s === "PENDING") return "trendyol_pending";
  if (s === "NOT_APPLICABLE") return "not_linked";
  return "trendyol_pending";
}

export function marketplaceSyncHeadline(params: {
  marketplaceSyncStatus: string | null | undefined;
  hasTrendyolMapping: boolean;
  lastXmlSyncAt: string | null | undefined;
  lastMarketplaceSyncAt: string | null | undefined;
}): { title: string; detail: string } {
  const { marketplaceSyncStatus, hasTrendyolMapping, lastXmlSyncAt, lastMarketplaceSyncAt } =
    params;
  const st = (marketplaceSyncStatus ?? "").toUpperCase() as MarketplaceSyncStatus;

  if (!hasTrendyolMapping) {
    return {
      title: "Trendyol’a bağlı değil",
      detail:
        "Bu ürünün Trendyol eşleşmesi olmadığı için marketplace senkronu uygulanmadı."
    };
  }

  if (st === "FAILED") {
    return {
      title: "Trendyol senkronu başarısız oldu",
      detail: "Son işlem Trendyol’a tam yansımadı. Ayrıntılar için aşağıdaki özet mesaja bakın."
    };
  }

  if (st === "SYNCED") {
    return {
      title: "Son XML güncellemesi Trendyol’a başarıyla işlendi",
      detail:
        "Panel verisi ile Trendyol tarafı son bilinen senkron noktasında hizalı görünüyor."
    };
  }

  if (st === "PENDING") {
    return {
      title: "XML verisi güncellendi, Trendyol’a henüz yansımadı",
      detail:
        "Veritabanı XML ile güncellendi; Trendyol’a aktarım bekliyor veya sırada (yayın / fiyat / stok)."
    };
  }

  if (st === "NOT_APPLICABLE") {
    return {
      title: "Marketplace senkronu uygulanmadı",
      detail: "Bu bağlamda otomatik Trendyol güncellemesi tetiklenmedi (bağlantı veya kural)."
    };
  }

  return {
    title: "Senkron durumu belirsiz",
    detail: "Henüz senkron özeti oluşturulmadı veya eski kayıt."
  };
}

export function formatTrDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

/** Liste / tablo için kısa etiket */
export function compactMarketplaceSyncLabel(
  status: string | null | undefined,
  hasTrendyolMapping: boolean
): string {
  const b = resolveMarketplaceSyncBadge(status, hasTrendyolMapping);
  if (b === "not_linked") return "Trendyol yok";
  if (b === "trendyol_ok") return "Trendyol güncel";
  if (b === "trendyol_failed") return "TY hata";
  if (b === "trendyol_pending") return "TY bekliyor";
  return "—";
}

export function marketplaceSyncChipClass(
  status: string | null | undefined,
  hasTrendyolMapping: boolean
): string {
  const b = resolveMarketplaceSyncBadge(status, hasTrendyolMapping);
  if (b === "not_linked") return "bg-zinc-800/80 text-zinc-300 border border-zinc-600/50";
  if (b === "trendyol_ok") return "bg-emerald-900/50 text-emerald-200 border border-emerald-700/40";
  if (b === "trendyol_failed") return "bg-red-900/45 text-red-200 border border-red-800/50";
  if (b === "trendyol_pending") return "bg-amber-900/40 text-amber-200 border border-amber-700/45";
  return "bg-slate-800 text-slate-400 border border-slate-600/50";
}
