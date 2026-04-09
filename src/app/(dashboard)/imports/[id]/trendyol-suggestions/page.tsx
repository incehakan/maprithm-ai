"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { formatApiErrorMessage } from "@/lib/apiErrorMessage";
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

type SuggestedAttr = {
  id: string;
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
  isRequired: boolean;
  matchReason?: string | null;
};

type SuggestionRow = {
  suggestionId: string;
  importRowId: string;
  rowIndex: number;
  importRowStatus: string;
  productName: string;
  normalizedSku: string | null;
  suggestedBrandId: number | null;
  suggestedBrandName: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  confidenceScore: number | null;
  confidenceBand: "high" | "medium" | "low";
  missingRequiredCount: number;
  status: string;
  aiReasoningSummary: string | null;
  suggestedAttributes: SuggestedAttr[];
};

type StatusFilter = "all" | "suggested" | "approved" | "rejected" | "applied";
type ConfidenceFilter = "all" | "high" | "medium" | "low";

type MappingApplyReport = {
  total: number;
  successCount: number;
  failedCount: number;
  successes: Array<{
    suggestionId: string;
    rowIndex: number;
    productName: string;
    message: string;
  }>;
  failures: Array<{
    suggestionId: string;
    rowIndex: number;
    productName: string;
    reasons: string[];
  }>;
};

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved")
    return "bg-emerald-900/50 text-emerald-200 border-emerald-700/40";
  if (s === "rejected") return "bg-red-900/50 text-red-200 border-red-800/40";
  if (s === "applied") return "bg-violet-900/50 text-violet-200 border-violet-700/40";
  if (s === "suggested")
    return "bg-amber-900/50 text-amber-100 border-amber-700/40";
  return "bg-slate-800 text-slate-300 border-slate-600";
}

function confidenceBadgeClass(band: string): string {
  if (band === "high")
    return "bg-emerald-900/40 text-emerald-300 border-emerald-700/30";
  if (band === "medium")
    return "bg-amber-900/40 text-amber-200 border-amber-700/30";
  return "bg-red-900/35 text-red-200 border-red-800/30";
}

function confidenceLabel(band: string): string {
  if (band === "high") return "Yüksek";
  if (band === "medium") return "Orta";
  return "Düşük";
}

function ImportTrendyolSuggestionsPageContent() {
  const params = useParams();
  const jobId = typeof params?.id === "string" ? params.id : "";

  const [rawRows, setRawRows] = useState<SuggestionRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [confidenceFilter, setConfidenceFilter] =
    useState<ConfidenceFilter>("all");
  const [missingOnly, setMissingOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [mappingReport, setMappingReport] = useState<MappingApplyReport | null>(
    null
  );
  const [detailRow, setDetailRow] = useState<SuggestionRow | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/imports/${jobId}/trendyol-suggestions`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Yüklenemedi." })
        );
      }
      setRawRows(data.rows ?? []);
      setTruncated(Boolean(data.truncated));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (confidenceFilter !== "all" && r.confidenceBand !== confidenceFilter)
        return false;
      if (missingOnly && r.missingRequiredCount <= 0) return false;
      return true;
    });
  }, [rawRows, statusFilter, confidenceFilter, missingOnly]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(new Set(filteredRows.map((r) => r.suggestionId)));
  };

  const clearSelection = () => setSelected(new Set());

  async function runBulk(action: "approve" | "reject" | "apply_mapping") {
    if (selected.size === 0) {
      setBulkMessage("Önce satır seçin.");
      return;
    }
    setBulkLoading(true);
    setBulkMessage(null);
    setMappingReport(null);
    try {
      const res = await fetch(
        `/api/imports/${jobId}/trendyol-suggestions/bulk`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            suggestionIds: [...selected]
          })
        }
      );
      const bodyText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        if (bodyText.trim()) {
          data = JSON.parse(bodyText) as Record<string, unknown>;
        }
      } catch {
        /* formatApiErrorMessage */
      }
      if (!res.ok) {
        throw new Error(
          formatApiErrorMessage(res.status, res.statusText, bodyText)
        );
      }

      if (action === "apply_mapping") {
        const report: MappingApplyReport = {
          total: Number(data.total ?? 0),
          successCount: Number(data.successCount ?? 0),
          failedCount: Number(data.failedCount ?? 0),
          successes: (data.successes as MappingApplyReport["successes"]) ?? [],
          failures: (data.failures as MappingApplyReport["failures"]) ?? []
        };
        setMappingReport(report);
        setBulkMessage(
          `${report.total} kayıt işlendi, ${report.successCount} başarılı, ${report.failedCount} başarısız.`
        );
      } else {
        const failed = (data.results as { ok: boolean }[] | undefined)?.filter(
          (x) => !x.ok
        ).length;
        setBulkMessage(
          `${data.processed} kayıt işlendi.${failed ? ` ${failed} hata.` : ""}`
        );
      }

      clearSelection();
      await load();
    } catch (e) {
      setBulkMessage(e instanceof Error ? e.message : "Hata");
    } finally {
      setBulkLoading(false);
    }
  }

  const allFilteredSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.has(r.suggestionId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/imports/${jobId}`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← İçe aktarma satırları
        </Link>
        <Link href="/imports" className="text-sm text-slate-500 hover:text-slate-300">
          Tüm içe aktarmalar
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-100">
          Trendyol AI önerileri
        </h1>
        <p className="text-sm text-slate-400">
          Marka, kategori ve özellik önerilerini inceleyin; toplu onay, red veya
          ürün eşlemesine aktarın.
        </p>
      </div>

      {truncated && (
        <p className="text-xs text-amber-500/90">
          İlk 1000 öneri listeleniyor. Daha fazlası için filtreleri kullanın veya
          veriyi bölün.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Filtreler
        </h2>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 w-full sm:w-auto">Durum:</span>
          {(
            [
              ["all", "Tümü"],
              ["suggested", "Bekleyen"],
              ["approved", "Onaylanan"],
              ["rejected", "Reddedilen"],
              ["applied", "Uygulanan"]
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
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-slate-500 w-full sm:w-auto">Güven:</span>
          {(
            [
              ["all", "Tümü"],
              ["high", "Yüksek (≥70)"],
              ["medium", "Orta (40–69)"],
              ["low", "Düşük (<40)"]
            ] as const
          ).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setConfidenceFilter(val)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                confidenceFilter === val
                  ? "border-indigo-500 bg-indigo-950/60 text-indigo-200"
                  : "border-slate-600 text-slate-400 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={missingOnly}
            onChange={(e) => setMissingOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900"
          />
          Eksik zorunlu özelliği olanlar
        </label>
        <p className="text-xs text-slate-500">
          Gösterilen: {filteredRows.length} / {rawRows.length} öneri
        </p>
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3">
          <h2 className="text-sm font-semibold text-slate-100">Toplu işlem</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filteredRows.length === 0}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Filtrelileri seç
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Seçimi temizle
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={bulkLoading || selected.size === 0}
            onClick={() => runBulk("approve")}
            className="btn-primary text-sm disabled:opacity-50"
          >
            Seçilileri onayla
          </button>
          <button
            type="button"
            disabled={bulkLoading || selected.size === 0}
            onClick={() => runBulk("reject")}
            className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-100 hover:bg-red-950/60 disabled:opacity-50"
          >
            Seçilileri reddet
          </button>
          <button
            type="button"
            disabled={bulkLoading || selected.size === 0}
            onClick={() => runBulk("apply_mapping")}
            className="rounded-lg border border-violet-700 bg-violet-950/50 px-4 py-2 text-sm text-violet-100 hover:bg-violet-950/70 disabled:opacity-50"
          >
            Mapping&apos;e uygula
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Mapping: SKU ile eşleşen ürün varsa güncellenir; yoksa yeni ürün +
          Trendyol eşlemesi oluşturulur. Kategori ve marka Trendyol tarafında
          zorunlu alanlar; fiyat ve stok &gt; 0 olmalı.
        </p>
        {bulkMessage && (
          <p className="text-sm text-slate-300">{bulkMessage}</p>
        )}

        {mappingReport && (
          <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm">
            <p className="font-medium text-slate-200">
              Mapping özeti:{" "}
              <span className="tabular-nums text-slate-300">
                {mappingReport.total} kayıt işlendi,{" "}
                <span className="text-emerald-400/90">
                  {mappingReport.successCount} başarılı
                </span>
                ,{" "}
                <span className="text-red-300/90">
                  {mappingReport.failedCount} başarısız
                </span>
              </span>
            </p>

            {mappingReport.successes.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-600/90">
                  Başarılı
                </h3>
                <ul className="max-h-40 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {mappingReport.successes.map((s) => (
                    <li
                      key={s.suggestionId}
                      className="rounded border border-emerald-900/40 bg-emerald-950/20 px-2 py-1.5"
                    >
                      <span className="font-medium text-slate-100">
                        {s.productName}
                      </span>
                      <span className="text-slate-500">
                        {" "}
                        · Satır {s.rowIndex}
                      </span>
                      <div className="text-emerald-400/90">
                        {s.message || "Mapping oluşturuldu."}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mappingReport.failures.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-500/90">
                  Başarısız (nedenler)
                </h3>
                <ul className="max-h-64 space-y-3 overflow-y-auto text-xs">
                  {mappingReport.failures.map((f) => (
                    <li
                      key={f.suggestionId}
                      className="rounded border border-red-900/50 bg-red-950/25 px-3 py-2 text-slate-200"
                    >
                      <div className="font-medium text-slate-100">
                        {f.productName}
                      </div>
                      <div className="text-slate-500">
                        Satır {f.rowIndex} · id {f.suggestionId.slice(0, 8)}…
                      </div>
                      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-red-200/90">
                        {f.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-sm text-slate-500">
          Öneri yok veya filtrelere uyan kayıt yok. Önce{" "}
          <code className="text-indigo-400">suggestions/generate</code> çağrısı
          yapın.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <th className="pb-2 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={() =>
                      allFilteredSelected
                        ? clearSelection()
                        : selectAllFiltered()
                    }
                    className="rounded border-slate-600 bg-slate-900"
                  />
                </th>
                <th className="pb-2 pr-2">Ürün</th>
                <th className="pb-2 pr-2">Marka</th>
                <th className="pb-2 pr-2">Kategori</th>
                <th className="pb-2 pr-2">Güven</th>
                <th className="pb-2 pr-2">Eksik öz.</th>
                <th className="pb-2 pr-2">Durum</th>
                <th className="pb-2 pr-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRows.map((r) => (
                <Fragment key={r.suggestionId}>
                  <tr className="text-slate-200">
                    <td className="py-2 pr-2 align-top">
                      <input
                        type="checkbox"
                        checked={selected.has(r.suggestionId)}
                        onChange={() => toggleSelect(r.suggestionId)}
                        className="rounded border-slate-600 bg-slate-900"
                      />
                    </td>
                    <td className="py-2 pr-2 align-top max-w-[200px]">
                      <div className="font-medium text-slate-100 truncate" title={r.productName}>
                        {r.productName}
                      </div>
                      <div className="text-xs text-slate-500">
                        Satır {r.rowIndex}
                        {r.normalizedSku ? ` · ${r.normalizedSku}` : ""}
                      </div>
                    </td>
                    <td className="py-2 pr-2 align-top text-sm">
                      <div className="flex flex-col gap-1">
                        <span>
                          {r.suggestedBrandName ?? (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>
                        {r.suggestedBrandId == null && (
                          <span className="inline-flex w-fit rounded border border-amber-800/50 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-200/90">
                            Marka eksik
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-2 align-top text-sm">
                      <div className="flex flex-col gap-1">
                        <span>
                          {r.suggestedCategoryName ?? (
                            <span className="text-slate-600">—</span>
                          )}
                        </span>
                        {r.suggestedCategoryId == null && (
                          <span className="inline-flex w-fit rounded border border-amber-800/50 bg-amber-950/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-200/90">
                            Kategori eksik
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBadgeClass(r.confidenceBand)}`}
                      >
                        {r.confidenceScore != null
                          ? `${Math.round(r.confidenceScore)} · `
                          : ""}
                        {confidenceLabel(r.confidenceBand)}
                      </span>
                    </td>
                    <td className="py-2 pr-2 align-top">
                      {r.missingRequiredCount > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 text-xs font-medium text-amber-200">
                          {r.missingRequiredCount} eksik
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">0</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${statusBadgeClass(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-2 align-top whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => setDetailRow(r)}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Detay
                      </button>
                      <Link
                        href={`/imports/${jobId}/trendyol-suggestions/${r.suggestionId}`}
                        className="text-xs text-amber-400/90 hover:text-amber-300"
                      >
                        Düzenle
                      </Link>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-xl border border-slate-700 bg-slate-950 p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-100">
                  Öneri detayı
                </h3>
                <p className="text-sm text-slate-400">{detailRow.productName}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-300 hover:bg-slate-800"
              >
                Kapat
              </button>
            </div>
            <dl className="grid gap-2 text-sm text-slate-300">
              <div>
                <dt className="text-slate-500">Marka</dt>
                <dd>
                  {detailRow.suggestedBrandName ?? "—"}{" "}
                  {detailRow.suggestedBrandId != null &&
                    `(id ${detailRow.suggestedBrandId})`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Kategori</dt>
                <dd>
                  {detailRow.suggestedCategoryName ?? "—"}{" "}
                  {detailRow.suggestedCategoryId != null &&
                    `(id ${detailRow.suggestedCategoryId})`}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Güven</dt>
                <dd>
                  {detailRow.confidenceScore != null
                    ? detailRow.confidenceScore
                    : "—"}{" "}
                  · {confidenceLabel(detailRow.confidenceBand)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Özet</dt>
                <dd className="text-slate-400">
                  {detailRow.aiReasoningSummary ?? "—"}
                </dd>
              </div>
            </dl>
            <h4 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Önerilen özellikler ({detailRow.suggestedAttributes.length})
            </h4>
            <ul className="mt-2 max-h-48 space-y-2 overflow-auto text-sm">
              {detailRow.suggestedAttributes.map((a) => (
                <li
                  key={a.id}
                  className="rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5"
                >
                  {a.isRequired && (
                    <span className="text-red-400" title="Zorunlu">
                      *
                    </span>
                  )}{" "}
                  <span className="font-medium text-slate-200">
                    {a.attributeName}
                  </span>
                  <span className="text-slate-500"> ({a.attributeId})</span>
                  <div className="text-xs text-slate-400">
                    {a.attributeValueId != null
                      ? `${a.attributeValue ?? ""} (valueId ${a.attributeValueId})`
                      : a.customValue
                        ? `Özel: ${a.customValue}`
                        : "—"}
                  </div>
                  {a.matchReason && (
                    <div className="mt-1 text-[11px] text-indigo-300/90">
                      Neden: {a.matchReason}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-slate-500">
              Tam düzenleme:{" "}
              <Link
                href={`/imports/${jobId}/trendyol-suggestions/${detailRow.suggestionId}`}
                className="text-amber-400/90 hover:text-amber-300"
              >
                öneri sayfasına git →
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportTrendyolSuggestionsPage() {
  return (
    <ClientPagePermissionGuard permission="imports.manage">
      <ImportTrendyolSuggestionsPageContent />
    </ClientPagePermissionGuard>
  );
}
