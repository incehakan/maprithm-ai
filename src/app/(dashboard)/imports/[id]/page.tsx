"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { formatApiErrorMessage } from "@/lib/apiErrorMessage";
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

type Job = {
  id: string;
  sourceType: string;
  originalFileName: string;
  status: string;
  usageStatus?: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  rowIndex: number;
  rawData: unknown;
  normalizedName: string | null;
  normalizedDescription: string | null;
  normalizedBrand: string | null;
  normalizedCategoryText: string | null;
  normalizedSku: string | null;
  normalizedBarcode: string | null;
  mainImageUrl: string | null;
  imageUrls: unknown;
  price: number | null;
  stock: number | null;
  status: string;
  errorMessage: string | null;
};

const PAGE_SIZE = 50;
/** Trendyol AI generate: tek HTTP isteğinde işlenecek satır (OpenAI yükü) */
const TRENDYOL_SUGGEST_BATCH = 40;

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed")
    return "bg-emerald-900/40 text-emerald-300 border border-emerald-700/30";
  if (s === "normalized" || s === "approved")
    return "bg-emerald-900/40 text-emerald-300";
  if (s === "processing")
    return "bg-sky-900/40 text-sky-200 border border-sky-700/30";
  if (s === "failed") return "bg-red-900/40 text-red-200";
  if (s === "pending") return "bg-slate-800 text-slate-300";
  return "bg-slate-800 text-slate-400";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function Cell({ v }: { v: string | number | null | undefined }) {
  if (v == null || v === "") return <span className="text-slate-600">—</span>;
  const s = typeof v === "number" ? String(v) : v;
  return (
    <span className="block max-w-[140px] truncate" title={s}>
      {s}
    </span>
  );
}

function getImageCount(raw: unknown): number {
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function ImportJobDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === "string" ? params.id : "";

  const [job, setJob] = useState<Job | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [failedInDb, setFailedInDb] = useState(0);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<"all" | "failed">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateProgress, setGenerateProgress] = useState<string | null>(null);
  /** Boşken generate tüm satırlar; doluyken yalnızca bu id'ler */
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset)
      });
      if (filter === "failed") qs.set("status", "failed");
      const res = await fetch(`/api/imports/${id}?${qs}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Yüklenemedi." })
        );
      }
      setJob(data.job);
      setRows(data.rows ?? []);
      setTotal(data.pagination?.total ?? 0);
      setFailedInDb(data.counts?.failedRowsInDb ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, [id, offset, filter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [filter]);

  useEffect(() => {
    if (!toast || toast.type !== "error") return;
    const t = window.setTimeout(() => setToast(null), 5500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggleRowSelected = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  }, [rows]);

  const deselectAllOnPage = useCallback(() => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) next.delete(r.id);
      return next;
    });
  }, [rows]);

  const clearRowSelection = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const handleGenerateTrendyolSuggestions = useCallback(async (regenerate = false) => {
    if (!id) return;
    const selectedIds = Array.from(selectedRowIds);
    const scopeSelected = selectedIds.length > 0;

    setGenerateLoading(true);
    setGenerateProgress("Başlatılıyor…");
    setToast(null);
    try {
      let offset = 0;
      let totalRows = 0;
      let iterations = 0;
      const maxIterations = 5000;

      for (;;) {
        if (++iterations > maxIterations) {
          throw new Error(
            "İşlem güvenlik limitine takıldı. Lütfen destek ile iletişime geçin."
          );
        }

        const res = await fetch(`/api/imports/${id}/suggestions/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(scopeSelected ? { importRowIds: selectedIds } : {}),
            ...(regenerate ? { regenerate: true } : {}),
            limit: TRENDYOL_SUGGEST_BATCH,
            offset
          })
        });
        const bodyText = await res.text();
        let data: Record<string, unknown> = {};
        try {
          if (bodyText.trim()) {
            data = JSON.parse(bodyText) as Record<string, unknown>;
          }
        } catch {
          /* aşağıda formatApiErrorMessage bodyText kullanır */
        }

        if (!res.ok) {
          throw new Error(
            formatApiErrorMessage(res.status, res.statusText, bodyText)
          );
        }

        const p = data.pagination as
          | {
              nextOffset: number;
              totalRows: number;
              hasMore: boolean;
            }
          | undefined;

        if (p) {
          totalRows = p.totalRows;
          const done = Math.min(p.nextOffset, p.totalRows);
          setGenerateProgress(`${done} / ${p.totalRows} satır işlendi`);
          offset = p.nextOffset;
          if (!p.hasMore) break;
        } else {
          break;
        }
      }

      setGenerateProgress(null);
      if (scopeSelected) {
        setSelectedRowIds(new Set());
      }
      setToast({
        type: "success",
        message:
          totalRows > 0
            ? scopeSelected
              ? `${regenerate ? "Seçilen satırlar yeniden üretildi" : "Seçilen satırlar için AI önerileri tamamlandı"} (${totalRows} satır).`
              : `${regenerate ? "AI önerileri yeniden üretildi" : "AI önerileri tamamlandı"} (${totalRows} satır).`
            : regenerate
              ? "AI önerileri yeniden üretildi."
              : "AI önerileri oluşturuldu."
      });
      window.setTimeout(() => {
        router.push(`/imports/${id}/trendyol-suggestions`);
      }, 1600);
    } catch (e) {
      setGenerateProgress(null);
      setToast({
        type: "error",
        message:
          e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu."
      });
    } finally {
      setGenerateLoading(false);
      setGenerateProgress(null);
    }
  }, [id, router, selectedRowIds]);

  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="space-y-6">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[100] max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg ${
            toast.type === "success"
              ? "border-emerald-700/60 bg-emerald-950/95 text-emerald-100"
              : "border-red-800/70 bg-red-950/95 text-red-100"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/imports"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← İçe aktarmalar
        </Link>
        {id && (
          <Link
            href={`/imports/${id}/trendyol-suggestions`}
            className="text-sm font-medium text-amber-400/90 hover:text-amber-300"
            aria-disabled={job?.usageStatus === "passive"}
            style={
              job?.usageStatus === "passive"
                ? { pointerEvents: "none", opacity: 0.5 }
                : undefined
            }
          >
            Trendyol AI önerileri →
          </Link>
        )}
      </div>

      {loading && !job && (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      )}
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {job && (
        <>
          <div className="card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 pb-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-slate-100">
                  {job.originalFileName}
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  Kaynak:{" "}
                  <span className="font-mono text-slate-300">
                    {job.sourceType}
                  </span>
                </p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(job.status)}`}
              >
                {job.status}
              </span>
              <span
                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  (job.usageStatus ?? "active") === "passive"
                    ? "bg-zinc-800 text-zinc-300 border-zinc-600"
                    : "bg-emerald-900/50 text-emerald-200 border-emerald-700/40"
                }`}
                title={
                  (job.usageStatus ?? "active") === "passive"
                    ? "Pasif — bu veri kullanılmaz"
                    : undefined
                }
              >
                {(job.usageStatus ?? "active") === "passive" ? "Passive" : "Active"}
              </span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                <dt className="text-xs font-medium uppercase text-slate-500">
                  Toplam satır
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-100">
                  {job.totalRows}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                <dt className="text-xs font-medium uppercase text-slate-500">
                  İşlenen (OK)
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-emerald-400/90">
                  {job.successRows}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                <dt className="text-xs font-medium uppercase text-slate-500">
                  Hatalı satır
                </dt>
                <dd className="text-lg font-semibold tabular-nums text-red-400/90">
                  {job.failedRows}
                </dd>
              </div>
              <div className="rounded-lg bg-slate-900/60 px-3 py-2">
                <dt className="text-xs font-medium uppercase text-slate-500">
                  Oluşturulma
                </dt>
                <dd className="text-sm text-slate-200">
                  {formatDate(job.createdAt)}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-3 border-t border-slate-700 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-xl space-y-1">
                <p className="text-xs leading-relaxed text-slate-500">
                  Aşağıdaki tabloda{" "}
                  <strong className="text-slate-400">satır seçerek</strong> yalnızca
                  test etmek istediğiniz ürünler için öneri alabilirsiniz. Seçim
                  yoksa <strong className="text-slate-400">tüm satırlar</strong>{" "}
                  işlenir. Büyük dosyalarda işlem{" "}
                  <strong className="text-slate-400">
                    {TRENDYOL_SUGGEST_BATCH} satırlık partiler
                  </strong>{" "}
                  halinde gider (her satırda AI çağrıları vardır).
                </p>
                {selectedRowIds.size > 0 && (
                  <p className="text-xs font-medium text-amber-200/90">
                    {selectedRowIds.size} satır seçili — öneri yalnızca bunlar için
                    üretilecek.
                  </p>
                )}
                {generateLoading && generateProgress && (
                  <p className="text-xs font-medium text-sky-300/90">
                    {generateProgress}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={
                    generateLoading ||
                    job.totalRows === 0 ||
                    (job.usageStatus ?? "active") !== "active"
                  }
                  onClick={() => handleGenerateTrendyolSuggestions(false)}
                  className="btn-primary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generateLoading
                    ? "Öneriler oluşturuluyor…"
                    : selectedRowIds.size > 0
                      ? `Seçilenler için AI (${selectedRowIds.size})`
                      : "Trendyol AI Önerileri Oluştur (tümü)"}
                </button>
                <button
                  type="button"
                  disabled={
                    generateLoading ||
                    job.totalRows === 0 ||
                    (job.usageStatus ?? "active") !== "active"
                  }
                  onClick={() => handleGenerateTrendyolSuggestions(true)}
                  className="btn-secondary whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
                  title="Mevcut önerileri silmeden, aynı satırlar için yeniden üretip günceller."
                >
                  {selectedRowIds.size > 0
                    ? `Seçilenleri Yeniden Oluştur (${selectedRowIds.size})`
                    : "Tümünü Yeniden Oluştur"}
                </button>
              </div>
            </div>

            {failedInDb > 0 && (
              <p className="text-xs text-amber-200/90">
                Veritabanında{" "}
                <strong className="tabular-nums">{failedInDb}</strong> satır
                &quot;failed&quot; durumunda. Aşağıdan yalnızca hatalıları
                süzebilirsiniz.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-lg border border-slate-700 p-0.5">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  filter === "all"
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tüm satırlar
              </button>
              <button
                type="button"
                onClick={() => setFilter("failed")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  filter === "failed"
                    ? "bg-red-900/50 text-red-100"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Yalnızca hatalılar
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <button
                type="button"
                disabled={!canPrev || loading}
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40"
              >
                Önceki
              </button>
              <span className="tabular-nums">
                {total === 0 ? 0 : offset + 1}–
                {Math.min(offset + rows.length, offset + PAGE_SIZE)} / {total}
              </span>
              <button
                type="button"
                disabled={!canNext || loading}
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40"
              >
                Sonraki
              </button>
            </div>
          </div>

          {filter === "failed" && rows.length === 0 && !loading && (
            <p className="text-sm text-slate-500">
              Hatalı satır bulunmuyor veya bu filtrede sonuç yok.
            </p>
          )}

          <div className="card overflow-x-auto">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Satır listesi — normalize alanlar
              </h2>
              {rows.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="tabular-nums text-slate-400">
                    Seçili: {selectedRowIds.size}
                  </span>
                  <button
                    type="button"
                    onClick={selectAllOnPage}
                    disabled={loading}
                    className="rounded border border-slate-600 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Bu sayfayı seç
                  </button>
                  <button
                    type="button"
                    onClick={deselectAllOnPage}
                    disabled={loading}
                    className="rounded border border-slate-600 px-2 py-1 text-slate-300 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Bu sayfayı kaldır
                  </button>
                  <button
                    type="button"
                    onClick={clearRowSelection}
                    disabled={loading || selectedRowIds.size === 0}
                    className="rounded border border-slate-600 px-2 py-1 text-slate-400 hover:bg-slate-800 disabled:opacity-40"
                  >
                    Tüm seçimi temizle
                  </button>
                </div>
              )}
            </div>
            {loading && job ? (
              <p className="text-sm text-slate-500">Tablo yenileniyor…</p>
            ) : null}
            {rows.length === 0 && !loading ? (
              <p className="text-sm text-slate-500">Satır yok.</p>
            ) : rows.length > 0 ? (
              <div className="max-h-[70vh] overflow-auto">
                <table className="w-full min-w-[1100px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-950">
                    <tr className="border-b border-slate-700 text-slate-500">
                      <th className="w-10 pb-2 pr-2" title="AI önerisi için seç">
                        <span className="sr-only">Seç</span>
                      </th>
                      <th className="pb-2 pr-2">#</th>
                      <th className="pb-2 pr-2">Durum</th>
                      <th className="pb-2 pr-2">Ad</th>
                      <th className="pb-2 pr-2">Açıklama</th>
                      <th className="pb-2 pr-2">Marka</th>
                      <th className="pb-2 pr-2">Kategori</th>
                      <th className="pb-2 pr-2">SKU</th>
                      <th className="pb-2 pr-2">Barkod</th>
                      <th className="pb-2 pr-2">Ana Görsel</th>
                      <th className="pb-2 pr-2">Görsel Sayısı</th>
                      <th className="pb-2 pr-2">Fiyat</th>
                      <th className="pb-2 pr-2">Stok</th>
                      <th className="pb-2 pr-2">Hata</th>
                      <th className="pb-2">Ham</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {rows.map((r) => {
                      const isFail = r.status === "failed";
                      return (
                        <Fragment key={r.id}>
                          <tr
                            className={
                              isFail
                                ? "bg-red-950/20 text-slate-200"
                                : "text-slate-300"
                            }
                          >
                            <td className="py-2 pr-2 align-top">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
                                checked={selectedRowIds.has(r.id)}
                                onChange={() => toggleRowSelected(r.id)}
                                aria-label={`Satır ${r.rowIndex} için AI kapsamına al`}
                              />
                            </td>
                            <td className="py-2 pr-2 align-top font-mono">
                              {r.rowIndex}
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <span
                                className={`rounded px-1.5 py-0.5 ${statusBadgeClass(r.status)}`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedName} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedDescription} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedBrand} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedCategoryText} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedSku} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.normalizedBarcode} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <Cell v={r.mainImageUrl} />
                            </td>
                            <td className="py-2 pr-2 align-top">
                              <span className="inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                                {getImageCount(r.imageUrls)}
                              </span>
                            </td>
                            <td className="py-2 pr-2 align-top tabular-nums">
                              <Cell v={r.price} />
                            </td>
                            <td className="py-2 pr-2 align-top tabular-nums">
                              <Cell v={r.stock} />
                            </td>
                            <td className="py-2 pr-2 align-top text-red-300/90">
                              <span
                                className="block max-w-[160px] truncate"
                                title={r.errorMessage ?? ""}
                              >
                                {r.errorMessage ?? "—"}
                              </span>
                            </td>
                            <td className="py-2 align-top">
                              <button
                                type="button"
                                className="text-indigo-400 hover:text-indigo-300"
                                onClick={() =>
                                  setExpandedId((x) =>
                                    x === r.id ? null : r.id
                                  )
                                }
                              >
                                {expandedId === r.id ? "Gizle" : "JSON"}
                              </button>
                            </td>
                          </tr>
                          {expandedId === r.id && (
                            <tr className="bg-slate-900/80">
                              <td colSpan={15} className="px-2 py-2">
                                {getImageCount(r.imageUrls) > 0 && (
                                  <div className="mb-2 rounded border border-slate-700 bg-slate-900/60 p-2">
                                    <p className="mb-1 text-[11px] text-slate-400">
                                      Görsel URL önizleme:
                                    </p>
                                    <pre className="max-h-24 overflow-auto text-[10px] text-slate-300">
                                      {JSON.stringify(r.imageUrls, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                <pre className="max-h-48 overflow-auto rounded border border-slate-700 p-2 text-[10px] text-slate-400">
                                  {JSON.stringify(r.rawData, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

export default function ImportJobDetailPage() {
  return (
    <ClientPagePermissionGuard permission="imports.manage">
      <ImportJobDetailPageContent />
    </ClientPagePermissionGuard>
  );
}
