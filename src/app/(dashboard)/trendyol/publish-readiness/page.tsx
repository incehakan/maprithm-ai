"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type ReadinessRow = {
  productId: string;
  productName: string;
  mappingId: string;
  publishStatus: string;
  trendyolBrandId: number | null;
  brandName: string | null;
  trendyolCategoryId: number | null;
  categoryName: string | null;
  missingCount: number;
  missing: string[];
  ready: boolean;
  aiApplied: boolean;
};

type StatusFilter = "all" | "ready" | "missing";

function publishStatusBadgeClass(s: string): string {
  const x = s.toLowerCase();
  if (x === "ready")
    return "bg-emerald-900/50 text-emerald-200 border-emerald-700/40";
  if (x === "published" || x === "sent")
    return "bg-sky-900/50 text-sky-200 border-sky-700/40";
  if (x === "failed")
    return "bg-red-900/50 text-red-200 border-red-800/40";
  if (x === "processing")
    return "bg-amber-900/50 text-amber-100 border-amber-700/40";
  return "bg-slate-800 text-slate-300 border-slate-600";
}

function TrendyolPublishReadinessPageContent() {
  const [rows, setRows] = useState<ReadinessRow[]>([]);
  const [total, setTotal] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [aiOnly, setAiOnly] = useState(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (statusFilter !== "all") p.set("filter", statusFilter);
    if (aiOnly) p.set("aiOnly", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  }, [statusFilter, aiOnly]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setBulkMessage(null);
    try {
      const res = await fetch(`/api/trendyol/publish-readiness${queryString}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Liste yüklenemedi."));
      }
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setTruncated(Boolean(data.truncated));
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.productId));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.productId)));
    }
  };

  const markSelectedReady = async () => {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      const res = await fetch("/api/trendyol/publish-readiness/mark-ready", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: [...selected] })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "İşlem başarısız."));
      }
      setBulkMessage(
        `${data.mappingsUpdated ?? 0} Trendyol eşlemesi "hazır" olarak işaretlendi.`
      );
      await load();
    } catch (e) {
      setBulkMessage(
        e instanceof Error ? e.message : "Toplu işlem hatası."
      );
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          Trendyol yayına hazırlık
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          AI eşleştirmesi uygulanmış veya manuel Trendyol mapping&apos;i olan
          ürünlerde{" "}
          <code className="text-indigo-400">evaluateTrendyolPublishReadiness</code>{" "}
          ile kontrol (kargo, fiyat, görsel, zorunlu özellikler).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-slate-500">
          Durum
        </span>
        {(
          [
            ["all", "Tümü"],
            ["ready", "Hazır olanlar"],
            ["missing", "Eksik olanlar"]
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setStatusFilter(val)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              statusFilter === val
                ? "border-indigo-500 bg-indigo-950/60 text-indigo-200"
                : "border-slate-600 text-slate-400 hover:border-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
        <label className="ml-2 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={aiOnly}
            onChange={(e) => setAiOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900"
          />
          Yalnızca AI ile eşleştirilenler{" "}
          <span className="text-xs text-slate-500">(MAPRITHM-*)</span>
        </label>
        <p className="text-xs text-slate-500">
          {loading ? "…" : `${total} kayıt`}
          {truncated ? " (en fazla 1000 çekildi)" : ""}
        </p>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-100">Toplu işlem</h2>
        <p className="text-xs text-slate-500">
          Seçili ürünlerin Trendyol mapping{" "}
          <strong className="text-slate-400">publishStatus</strong> alanı{" "}
          <code className="text-indigo-400">ready</code> yapılır. Eksik alanlar
          otomatik doldurulmaz; yayın öncesi ürün düzenlemeden tamamlayın.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={bulkLoading || selected.size === 0}
            onClick={markSelectedReady}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Seçilileri yayın için işaretle (ready)
          </button>
          <button
            type="button"
            onClick={toggleAll}
            disabled={rows.length === 0}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
          >
            {allSelected ? "Seçimi kaldır" : "Tümünü seç"}
          </button>
        </div>
        {bulkMessage && (
          <p className="text-sm text-slate-300">{bulkMessage}</p>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Kayıt yok veya filtrelere uyan Trendyol mapping bulunamadı.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <th className="pb-2 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-slate-600 bg-slate-900"
                  />
                </th>
                <th className="pb-2 pr-2">Ürün</th>
                <th className="pb-2 pr-2">Durum</th>
                <th className="pb-2 pr-2">Marka</th>
                <th className="pb-2 pr-2">Kategori</th>
                <th className="pb-2 pr-2">Eksik #</th>
                <th className="pb-2 pr-2">Eksikler</th>
                <th className="pb-2 pr-2">Hazır</th>
                <th className="pb-2 pr-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((r) => (
                <Fragment key={r.productId}>
                  <tr className="text-slate-200">
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(r.productId)}
                        onChange={() => toggle(r.productId)}
                        className="rounded border-slate-600 bg-slate-900"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top max-w-[200px]">
                      <div
                        className="font-medium text-slate-100 truncate"
                        title={r.productName}
                      >
                        {r.productName}
                      </div>
                      {r.aiApplied && (
                        <span className="mt-0.5 inline-block rounded border border-violet-800/50 bg-violet-950/40 px-1.5 py-0.5 text-[10px] text-violet-200">
                          AI mapping
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${publishStatusBadgeClass(r.publishStatus)}`}
                      >
                        {r.publishStatus}
                      </span>
                    </td>
                    <td className="py-2 pr-2 align-top text-sm">
                      {r.brandName ?? (
                        <span className="text-slate-600">—</span>
                      )}
                      {r.trendyolBrandId != null && (
                        <div className="text-xs text-slate-500">
                          id {r.trendyolBrandId}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top text-sm">
                      {r.categoryName ?? (
                        <span className="text-slate-600">—</span>
                      )}
                      {r.trendyolCategoryId != null && (
                        <div className="text-xs text-slate-500">
                          id {r.trendyolCategoryId}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top tabular-nums">
                      {r.missingCount > 0 ? (
                        <span className="inline-flex rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200">
                          {r.missingCount}
                        </span>
                      ) : (
                        <span className="text-slate-600">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top max-w-[280px]">
                      {r.missing.length === 0 ? (
                        <span className="text-slate-600 text-xs">—</span>
                      ) : (
                        <ul className="list-inside list-disc text-xs text-slate-400 space-y-0.5">
                          {r.missing.slice(0, 6).map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                          {r.missing.length > 6 && (
                            <li className="text-slate-500">
                              +{r.missing.length - 6} daha…
                            </li>
                          )}
                        </ul>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {r.ready ? (
                        <span className="inline-flex rounded-full border border-emerald-700/50 bg-emerald-950/40 px-2 py-0.5 text-xs font-medium text-emerald-200">
                          Evet
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-xs text-slate-400">
                          Hayır
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top whitespace-nowrap">
                      <Link
                        href={`/products/${r.productId}/edit`}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Detay
                      </Link>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrendyolPublishReadinessPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.publish">
      <TrendyolPublishReadinessPageContent />
    </ClientPagePermissionGuard>
  );
}
