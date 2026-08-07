"use client";

type PreviewField = { label: string; value: string };

type Props = {
  open: boolean;
  title?: string;
  mainImageUrl: string | null;
  imageUrls: string[];
  fields: PreviewField[];
  description?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  confirming?: boolean;
  confirmLabel?: string;
};

export function TrendyolPublishPreviewModal({
  open,
  title,
  mainImageUrl,
  imageUrls,
  fields,
  description,
  onCancel,
  onConfirm,
  confirming,
  confirmLabel
}: Props) {
  if (!open) return null;

  const allImages = [mainImageUrl, ...imageUrls].filter(
    (u, i, arr): u is string => !!u && arr.indexOf(u) === i
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-700 pb-3">
          <h3 className="text-sm font-semibold text-slate-100">
            {title ?? "Trendyol'a göndermeden önce önizleme"}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs text-slate-400">
          Trendyol'a gönderilecek verinin özeti aşağıda. Bir eksik/yanlış görürseniz{" "}
          <strong className="text-slate-300">İptal</strong> edip düzenleyin.
        </p>

        <div className="mb-4 flex gap-3 overflow-x-auto">
          {allImages.length === 0 && (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-red-700/60 bg-red-950/20 text-[10px] text-red-300">
              Görsel yok
            </div>
          )}
          {allImages.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={url}
              alt={`Görsel ${i + 1}`}
              className={`h-24 w-24 shrink-0 rounded-lg border object-cover ${
                i === 0 ? "border-emerald-600" : "border-slate-700"
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = "0.25";
              }}
            />
          ))}
        </div>
        {allImages.length > 0 && (
          <p className="mb-4 -mt-2 text-[10px] text-slate-500">
            Yeşil çerçeveli görsel ana görsel olarak gönderilecek.
          </p>
        )}

        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
          {fields.map((f) => (
            <div key={f.label} className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                {f.label}
              </span>
              <span
                className={`truncate ${
                  !f.value || f.value === "—"
                    ? "text-red-400"
                    : "text-slate-100"
                }`}
                title={f.value}
              >
                {f.value || "— (boş)"}
              </span>
            </div>
          ))}
        </div>

        {description && (
          <div className="mb-4">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              Açıklama
            </span>
            <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-700 bg-slate-950/50 p-2 text-xs text-slate-300">
              {description}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-700 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
          >
            İptal / Düzenle
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="btn-primary disabled:opacity-50"
          >
            {confirming ? "Gönderiliyor…" : confirmLabel ?? "Onayla ve Gönder"}
          </button>
        </div>
      </div>
    </div>
  );
}
