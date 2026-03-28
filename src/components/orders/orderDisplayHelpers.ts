const PACKAGE_STATUS_TR: Record<string, string> = {
  Created: "Oluşturuldu",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargoya verildi",
  Delivered: "Teslim edildi",
  Cancelled: "İptal edildi",
  UnDelivered: "Teslim edilemedi",
  Returned: "İade edildi",
  Repack: "Yeniden paketleme",
  UnPacked: "Parçalandı",
  UnSupplied: "Tedarik edilmedi",
  Unpacked: "Parçalandı",
  AtCollectionPoint: "Teslim noktasında"
};

export function packageStatusTR(v: string | null | undefined) {
  if (!v) return "—";
  return PACKAGE_STATUS_TR[v] ?? v;
}

export function ingestSourceLabel(v: string | null | undefined) {
  if (v === "manual_sync") return "Manuel senkron";
  if (v === "webhook") return "Webhook";
  if (v === "operation") return "Operasyon (panel)";
  if (v === "split") return "Split paket";
  if (v === "cron_sync") return "Zamanlanmış senkron";
  if (v === "reconcile") return "Uzlaştırma";
  if (!v) return "—";
  return v;
}
