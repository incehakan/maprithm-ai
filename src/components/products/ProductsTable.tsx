"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  lifecycleStatus: string;
  mappingPublishStatus: string | null;
  displayStatus: "active" | "out_of_stock" | "archived";
  createdAt: string;
};

type ProductsTableProps = {
  products: ProductRow[];
};

type OptimizeResponse = {
  successCount: number;
  errorCount: number;
  total: number;
  results: { productId: string; success: boolean; error?: string }[];
};

export function ProductsTable({ products }: ProductsTableProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingTrendyol, setExportingTrendyol] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [lastResult, setLastResult] = useState<OptimizeResponse | null>(null);

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((p) => p.id)));
    }
  }

  async function handleOptimize() {
    if (selectedIds.size === 0) {
      setMessage({ type: "info", text: "Lütfen en az bir ürün seçin." });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/ai/optimize-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: Array.from(selectedIds) })
      });

      const data = (await res.json().catch(() => null)) as
        | OptimizeResponse
        | { error?: string };

      if (!res.ok) {
        setMessage({
          type: "error",
          text: (data as { error?: string }).error || "İstek başarısız."
        });
        setLoading(false);
        return;
      }

      const result = data as OptimizeResponse;
      setSelectedIds(new Set());
      setLastResult(result);

      if (result.errorCount === 0) {
        setMessage({
          type: "success",
          text: `${result.successCount} ürün başarıyla optimize edildi.`
        });
      } else {
        setMessage({
          type: "success",
          text: `${result.successCount} ürün optimize edildi, ${result.errorCount} ürün hata aldı.`
        });
      }

      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Optimizasyon sırasında hata oluştu."
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleExportCsv() {
    if (products.length === 0) {
      setMessage({
        type: "info",
        text: "Dışa aktarılacak ürün bulunamadı."
      });
      return;
    }

    setExporting(true);
    try {
      const ids = Array.from(selectedIds);
      const query = ids.length
        ? `?ids=${encodeURIComponent(ids.join(","))}`
        : "";

      const res = await fetch(`/api/products/export${query}`, {
        method: "GET"
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || "CSV dışa aktarma başarısız.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "maprithm_products.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "CSV dışa aktarma sırasında hata oluştu."
      });
    } finally {
      setExporting(false);
    }
  }

  async function handleExportTrendyolCsv() {
    if (products.length === 0) {
      setMessage({
        type: "info",
        text: "Dışa aktarılacak ürün bulunamadı."
      });
      return;
    }

    setExportingTrendyol(true);
    try {
      const ids = Array.from(selectedIds);
      const query = ids.length
        ? `?ids=${encodeURIComponent(ids.join(","))}`
        : "";

      const res = await fetch(`/api/products/export/trendyol${query}`, {
        method: "GET"
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(
          data?.error || "Trendyol CSV dışa aktarma başarısız."
        );
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trendyol_products_professional.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Trendyol CSV dışa aktarma sırasında hata oluştu."
      });
    } finally {
      setExportingTrendyol(false);
    }
  }

  const DISPLAY_BADGE: Record<string, string> = {
    active: "bg-emerald-800 text-emerald-100",
    out_of_stock: "bg-amber-800 text-amber-100",
    archived: "bg-zinc-700 text-zinc-100"
  };
  const DISPLAY_LABEL: Record<string, string> = {
    active: "Aktif",
    out_of_stock: "Tükenen",
    archived: "Arşivde"
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <span>
            {selectedIds.size > 0
              ? `${selectedIds.size} ürün seçildi`
              : "Herhangi bir ürün seçilmedi."}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOptimize}
            disabled={loading || selectedIds.size === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {loading ? "Optimize ediliyor..." : "Seçili Ürünleri Optimize Et"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Seçimi temizle
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting || products.length === 0}
            className="inline-flex items-center rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-50"
          >
            {exporting ? "CSV hazırlanıyor..." : "CSV Dışa Aktar"}
          </button>
          <button
            type="button"
            onClick={handleExportTrendyolCsv}
            disabled={exportingTrendyol || products.length === 0}
            className="inline-flex items-center rounded-md border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-900/40 disabled:opacity-50"
          >
            {exportingTrendyol
              ? "Trendyol CSV hazırlanıyor..."
              : "Trendyol CSV (Profesyonel)"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-800 bg-emerald-900/30 text-emerald-200"
              : message.type === "error"
                ? "border-red-800 bg-red-900/30 text-red-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300"
          }`}
          role="alert"
        >
          <p>{message.text}</p>
          {lastResult &&
            lastResult.errorCount > 0 &&
            lastResult.results.some((r) => !r.success) && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs opacity-90">
                {lastResult.results
                  .filter((r): r is { productId: string; success: false; error?: string } => !r.success)
                  .map((r) => {
                    const product = products.find((p) => p.id === r.productId);
                    const label = product?.name ?? r.productId.slice(0, 8);
                    return (
                      <li key={r.productId}>
                        <span className="font-medium">{label}:</span>{" "}
                        {r.error ?? "Bilinmeyen hata"}
                      </li>
                    );
                  })}
              </ul>
            )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80 text-xs uppercase text-slate-400">
            <tr>
              <th className="w-10 px-2 py-3">
                <input
                  type="checkbox"
                  checked={
                    products.length > 0 &&
                    selectedIds.size === products.length
                  }
                  onChange={toggleAll}
                  className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                  aria-label="Tümünü seç"
                />
              </th>
              <th className="px-4 py-3 text-left">Ürün</th>
              <th className="px-4 py-3 text-left">Durum</th>
              <th className="px-4 py-3 text-right">Fiyat</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3 text-right">Toplam</th>
              <th className="px-4 py-3 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Henüz ürün eklenmemiş.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr
                key={p.id}
                className="border-t border-slate-800 hover:bg-slate-900/80"
              >
                <td className="w-10 px-2 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={() => toggleOne(p.id)}
                    className="rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-indigo-500"
                    aria-label={`${p.name} seç`}
                  />
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/products/${p.id}`}
                    className="font-medium text-slate-100 hover:text-indigo-400 hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.description && (
                    <div className="text-xs text-slate-400 line-clamp-1">
                      {p.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      DISPLAY_BADGE[p.displayStatus] ?? DISPLAY_BADGE.active
                    }`}
                  >
                    {DISPLAY_LABEL[p.displayStatus] ?? "Aktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  ₺{p.price.toLocaleString("tr-TR")}
                </td>
                <td className="px-4 py-3 text-right">{p.stock}</td>
                <td className="px-4 py-3 text-right">
                  ₺{(p.price * p.stock).toLocaleString("tr-TR")}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Link
                    href={`/products/${p.id}`}
                    className="text-xs text-slate-400 hover:text-slate-200 hover:underline"
                  >
                    Görüntüle
                  </Link>
                  <Link
                    href={`/products/${p.id}/edit`}
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Düzenle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
