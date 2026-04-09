"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { detectSourceTypeFromFileName } from "@/lib/importSourceType";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { resolveUserErrorMessage } from "@/lib/errors/resolveUserErrorMessage";

type ImportJobSummary = {
  id: string;
  sourceType: string;
  originalFileName: string;
  status: string;
  usageStatus: "active" | "passive" | "deleted" | string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  overrideBrandName?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BlockingProduct = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  publishStatus?: string | null;
};

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed")
    return "bg-emerald-900/50 text-emerald-300 border-emerald-700/40";
  if (s === "processing")
    return "bg-sky-900/50 text-sky-200 border-sky-700/40";
  if (s === "failed")
    return "bg-red-900/50 text-red-200 border-red-800/40";
  return "bg-slate-800 text-slate-300 border-slate-600";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return iso;
  }
}

function ImportsPageContent() {
  const [jobs, setJobs] = useState<ImportJobSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [listErrorDetail, setListErrorDetail] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [brandQuery, setBrandQuery] = useState("");
  const [brandHits, setBrandHits] = useState<
    Array<{ brandId: number; name: string }>
  >([]);
  const [brandSearchLoading, setBrandSearchLoading] = useState(false);
  const [selectedBrand, setSelectedBrand] = useState<{
    brandId: number;
    name: string;
  } | null>(null);
  const [sourceOverride, setSourceOverride] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [rowActionLoading, setRowActionLoading] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [blockingImport, setBlockingImport] = useState<{
    id: string;
    name: string;
    products: BlockingProduct[];
  } | null>(null);
  const [selectedBlockingIds, setSelectedBlockingIds] = useState<Set<string>>(new Set());
  async function changeUsageStatus(id: string, next: "activate" | "deactivate") {
    setRowActionLoading(id + next);
    try {
      const res = await fetch(`/api/imports/${id}/${next}`, { method: "POST" });
      const data = await safeParseJsonResponse<{
        success?: boolean;
        message?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, { fallback: "Durum değiştirilemedi." })
        );
      }
      setActionToast({
        type: "success",
        message:
          data?.message ||
          (next === "activate"
            ? "Import aktifleştirildi"
            : "Import pasife alındı")
      });
      await loadJobs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Durum değiştirilemedi.";
      setListError(msg);
      setActionToast({ type: "error", message: msg });
    } finally {
      setRowActionLoading(null);
    }
  }

  async function deleteImport(id: string, name: string) {
    if (!confirm(`${name} import kaydı silinsin mi? Bu işlem geri alınamaz.`)) return;
    setRowActionLoading(id + "delete");
    try {
      const res = await fetch(`/api/imports/${id}`, { method: "DELETE" });
      const data = await safeParseJsonResponse<{
        message?: string;
        error?: string;
        blockingProducts?: BlockingProduct[];
      }>(res);
      if (!res.ok) {
        if (res.status === 409 && (data?.blockingProducts?.length ?? 0) > 0) {
          const list = data?.blockingProducts ?? [];
          setBlockingImport({ id, name, products: list });
          setSelectedBlockingIds(new Set(list.map((p) => p.id)));
        }
        const errText = resolveUserErrorMessage(data, {
          fallback: "Import silinemedi."
        });
        setListErrorDetail(errText);
        throw new Error(errText);
      }
      setBlockingImport(null);
      setSelectedBlockingIds(new Set());
      setActionToast({
        type: "success",
        message: data?.message || "Import silindi"
      });
      await loadJobs();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import silinemedi.";
      setListError(msg);
      setActionToast({ type: "error", message: msg });
    } finally {
      setRowActionLoading(null);
    }
  }

  function toggleBlockingSelection(productId: string) {
    setSelectedBlockingIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAllBlocking() {
    if (!blockingImport) return;
    if (selectedBlockingIds.size === blockingImport.products.length) {
      setSelectedBlockingIds(new Set());
    } else {
      setSelectedBlockingIds(new Set(blockingImport.products.map((p) => p.id)));
    }
  }

  async function unpublishSelectedBlockingProducts() {
    if (!blockingImport || selectedBlockingIds.size === 0) {
      setActionToast({
        type: "error",
        message: "Yayından kaldırmak için en az bir ürün seçin."
      });
      return;
    }
    setRowActionLoading(`${blockingImport.id}-unpublish`);
    try {
      const res = await fetch(
        `/api/imports/${blockingImport.id}/unpublish-blocking`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: Array.from(selectedBlockingIds) })
        }
      );
      const data = await safeParseJsonResponse<{
        message?: string;
        successCount?: number;
        failedCount?: number;
        results?: Array<{ productId: string; ok: boolean; message?: string }>;
      }>(res);
      if (!res.ok) {
        throw new Error(
          resolveUserErrorMessage(data, {
            fallback: "Toplu yayından kaldırma başarısız."
          })
        );
      }

      const failedIds = new Set(
        (data?.results ?? []).filter((r) => !r.ok).map((r) => r.productId)
      );
      const remaining = blockingImport.products.filter((p) => failedIds.has(p.id));

      setBlockingImport(
        remaining.length > 0
          ? { ...blockingImport, products: remaining }
          : null
      );
      setSelectedBlockingIds(new Set(remaining.map((p) => p.id)));

      setActionToast({
        type: data?.failedCount ? "error" : "success",
        message:
          data?.message ||
          `Yayından kaldırıldı: ${data?.successCount ?? 0}, hata: ${data?.failedCount ?? 0}`
      });
      await loadJobs();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Toplu yayından kaldırma başarısız.";
      setActionToast({ type: "error", message: msg });
      setListError(msg);
    } finally {
      setRowActionLoading(null);
    }
  }

  function usageBadgeClass(status: string): string {
    const s = (status || "active").toLowerCase();
    if (s === "passive") return "bg-zinc-800 text-zinc-300 border-zinc-600";
    return "bg-emerald-900/50 text-emerald-200 border-emerald-700/40";
  }


  const detectedType = useMemo(() => {
    if (!file?.name) return null;
    return detectSourceTypeFromFileName(file.name);
  }, [file]);

  const loadJobs = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    setListErrorDetail(null);
    try {
      const res = await fetch("/api/imports");
      const data = await safeParseJsonResponse<{
        jobs?: ImportJobSummary[];
        message?: string;
        error?: string;
      }>(res);
      if (!data) {
        throw new Error("Sunucudan geçersiz yanıt alındı.");
      }
      if (!res.ok) {
        setListErrorDetail(data.error || null);
        throw new Error(data.message || "Import listesi alınamadı");
      }
      setJobs(data.jobs ?? []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Liste hatası");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (selectedBrand) {
      setBrandHits([]);
      return;
    }
    const q = brandQuery.trim();
    if (q.length < 2) {
      setBrandHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      setBrandSearchLoading(true);
      try {
        const res = await fetch(
          `/api/trendyol/brands/search?q=${encodeURIComponent(q)}&limit=40`
        );
        const data = await safeParseJsonResponse<{
          brands?: Array<{ brandId: number; name: string }>;
        }>(res);
        if (!cancelled && res.ok && data?.brands) setBrandHits(data.brands);
        else if (!cancelled) setBrandHits([]);
      } catch {
        if (!cancelled) setBrandHits([]);
      } finally {
        if (!cancelled) setBrandSearchLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [brandQuery, selectedBrand]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setUploadError("Önce bir dosya seçin.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (sourceOverride === "csv" || sourceOverride === "xlsx" || sourceOverride === "xml") {
        fd.append("sourceType", sourceOverride);
      }
      if (selectedBrand?.name?.trim()) {
        fd.append("overrideBrandName", selectedBrand.name.trim());
      }
      const res = await fetch("/api/imports/create", {
        method: "POST",
        body: fd
      });
      const parsed = await safeParseJsonResponse<{
        note?: string;
        message?: string;
      }>(res);
      if (!res.ok) {
        throw new Error(parsed?.message || "Yükleme başarısız.");
      }
      const data = parsed ?? {};
      const note = typeof data.note === "string" ? data.note : "";
      setUploadMessage(
        note
          ? `İş oluşturuldu. ${note}`
          : "İçe aktarma işi oluşturuldu."
      );
      setFile(null);
      setSelectedBrand(null);
      setBrandQuery("");
      setBrandHits([]);
      const input = document.getElementById("import-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      await loadJobs();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Hata");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-8">
      {actionToast && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            actionToast.type === "success"
              ? "border-emerald-800 bg-emerald-900/25 text-emerald-100"
              : "border-red-800 bg-red-900/30 text-red-200"
          }`}
        >
          {actionToast.message}
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dosya içe aktarma</h1>
        <p className="text-sm text-slate-400">
          CSV, XLSX veya XML dosyalarınızı yükleyin; satırlar ortak bir iş kaydında
          saklanır. Sonraki adımlarda bu veriler ürün oluşturmada kullanılabilir.
        </p>
        <div className="mt-2">
          <Link
            href="/xml-feeds"
            className="text-xs text-indigo-400 hover:text-indigo-300"
          >
            XML Feed Senkronizasyonu sayfasına git
          </Link>
        </div>
      </div>

      {blockingImport && (
        <div className="rounded-lg border border-amber-700/60 bg-amber-950/25 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-amber-200">
                {blockingImport.name} import kaydı silinemiyor
              </p>
              <p className="text-xs text-amber-300/90">
                Trendyol'da yayında olan ürünleri seçip topluca yayından kaldırın, sonra silmeyi tekrar deneyin.
              </p>
            </div>
            <button
              type="button"
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={() => {
                setBlockingImport(null);
                setSelectedBlockingIds(new Set());
              }}
            >
              Kapat
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs text-indigo-300 hover:text-indigo-200"
              onClick={toggleAllBlocking}
            >
              {selectedBlockingIds.size === blockingImport.products.length
                ? "Seçimi temizle"
                : "Tümünü seç"}
            </button>
            <button
              type="button"
              className="btn-primary text-xs disabled:opacity-50"
              onClick={unpublishSelectedBlockingProducts}
              disabled={
                rowActionLoading !== null || selectedBlockingIds.size === 0
              }
            >
              {rowActionLoading === `${blockingImport.id}-unpublish`
                ? "İşleniyor..."
                : `Seçilenleri Trendyol'da Yayından Kaldır (${selectedBlockingIds.size})`}
            </button>
          </div>

          <div className="overflow-x-auto rounded border border-amber-800/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900/70 text-slate-400">
                <tr>
                  <th className="p-2 w-8">
                    <input
                      type="checkbox"
                      checked={
                        blockingImport.products.length > 0 &&
                        selectedBlockingIds.size === blockingImport.products.length
                      }
                      onChange={toggleAllBlocking}
                    />
                  </th>
                  <th className="p-2">Ürün</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2">Barkod</th>
                  <th className="p-2">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {blockingImport.products.map((p) => (
                  <tr key={p.id} className="text-slate-200">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedBlockingIds.has(p.id)}
                        onChange={() => toggleBlockingSelection(p.id)}
                      />
                    </td>
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 text-slate-400">{p.sku || "-"}</td>
                    <td className="p-2 text-slate-400">{p.barcode || "-"}</td>
                    <td className="p-2">
                      <span className="inline-flex rounded-full border border-emerald-700/40 bg-emerald-900/40 px-2 py-0.5 text-[11px] text-emerald-200">
                        {p.publishStatus || "published"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Yeni içe aktarma
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="import-file-input">
              Dosya
            </label>
            <input
              id="import-file-input"
              type="file"
              accept=".csv,.xlsx,.xls,.xml,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/xml,text/xml"
              className="block w-full text-sm text-slate-300 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-200 hover:file:bg-slate-700"
              onChange={(ev) => {
                const f = ev.target.files?.[0] ?? null;
                setFile(f);
                setUploadError(null);
              }}
            />
            {file && (
              <p className="mt-2 text-xs text-slate-500">
                Seçilen: <span className="text-slate-300">{file.name}</span>
                {detectedType && (
                  <>
                    {" "}
                    · Algılanan tip:{" "}
                    <span className="text-indigo-300">{detectedType}</span>
                  </>
                )}
                {!detectedType && !sourceOverride && (
                  <span className="text-amber-500/90">
                    {" "}
                    — Uzantı tanınmıyor; aşağıdan tip seçin.
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="max-w-xl space-y-2">
            <label className="label" htmlFor="import-brand-search">
              Marka (isteğe bağlı)
            </label>
            <p className="text-xs text-slate-500 -mt-1">
              Trendyol kataloğundan seçilir; seçildiğinde dosyadaki marka alanı tüm satırlarda bu
              değerle değiştirilir. Boş bırakırsanız XML/CSV içindeki marka kullanılır.
            </p>
            {selectedBrand ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-800/50 bg-indigo-950/30 px-3 py-2 text-sm">
                <span className="text-slate-200">{selectedBrand.name}</span>
                <span className="text-xs text-slate-500">(id {selectedBrand.brandId})</span>
                <button
                  type="button"
                  className="text-xs text-amber-400/90 hover:text-amber-300"
                  onClick={() => {
                    setSelectedBrand(null);
                    setBrandQuery("");
                  }}
                >
                  Kaldır
                </button>
              </div>
            ) : (
              <>
                <input
                  id="import-brand-search"
                  type="text"
                  className="input"
                  placeholder="En az 2 harf yazın (örn. Nike)"
                  autoComplete="off"
                  value={brandQuery}
                  onChange={(e) => setBrandQuery(e.target.value)}
                />
                {brandSearchLoading && (
                  <p className="text-xs text-slate-500">Aranıyor…</p>
                )}
                {brandHits.length > 0 && (
                  <ul className="max-h-48 overflow-auto rounded-lg border border-slate-700 bg-slate-900/80 text-sm">
                    {brandHits.map((b) => (
                      <li key={b.brandId}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-slate-200 hover:bg-slate-800"
                          onClick={() => {
                            setSelectedBrand(b);
                            setBrandQuery("");
                            setBrandHits([]);
                          }}
                        >
                          {b.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="max-w-xs">
            <label className="label" htmlFor="source-type-override">
              Kaynak tipi (isteğe bağlı)
            </label>
            <select
              id="source-type-override"
              className="input"
              value={sourceOverride}
              onChange={(e) => setSourceOverride(e.target.value)}
            >
              <option value="">Otomatik (dosya adından)</option>
              <option value="csv">CSV</option>
              <option value="xlsx">XLSX / XLS</option>
              <option value="xml">XML</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Uzantı yanlış veya özel bir dosya için tipi elle seçin.
            </p>
          </div>

          {uploadError && (
            <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-200">
              {uploadError}
            </div>
          )}
          {uploadMessage && (
            <div className="rounded-lg border border-emerald-800 bg-emerald-900/25 px-3 py-2 text-sm text-emerald-100">
              {uploadMessage}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={uploading || !file}>
            {uploading ? "Yükleniyor…" : "İçe aktarmayı başlat"}
          </button>
        </form>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700 pb-2">
          <h2 className="text-sm font-semibold text-slate-100">İş geçmişi</h2>
          <button
            type="button"
            onClick={() => loadJobs()}
            className="text-xs text-indigo-400 hover:text-indigo-300"
            disabled={listLoading}
          >
            Yenile
          </button>
        </div>

        {listError && (
          <div className="rounded-lg border border-red-800 bg-red-900/20 px-3 py-2">
            <p className="text-sm text-red-300">{listError}</p>
            {listErrorDetail && (
              <p className="mt-1 text-xs text-red-200/80">{listErrorDetail}</p>
            )}
          </div>
        )}

        {listLoading ? (
          <p className="text-sm text-slate-400">Yükleniyor…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz içe aktarma yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Dosya</th>
                  <th className="pb-2 pr-3">Marka (ezme)</th>
                  <th className="pb-2 pr-3">Kaynak</th>
                  <th className="pb-2 pr-3">Durum</th>
                  <th className="pb-2 pr-3">Kullanım</th>
                  <th className="pb-2 pr-3 text-right">Toplam</th>
                  <th className="pb-2 pr-3 text-right">Başarılı</th>
                  <th className="pb-2 pr-3 text-right">Hatalı</th>
                  <th className="pb-2 pr-3">Tarih</th>
                  <th className="pb-2"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {jobs.map((j) => (
                  <tr
                    key={j.id}
                    className={`text-slate-200 ${
                      j.usageStatus === "passive" ? "opacity-60" : ""
                    }`}
                    title={
                      j.usageStatus === "passive"
                        ? "Pasif — bu veri kullanılmaz"
                        : undefined
                    }
                  >
                    <td className="py-2 pr-3 max-w-[200px] truncate" title={j.originalFileName}>
                      {j.originalFileName}
                    </td>
                    <td className="py-2 pr-3 max-w-[140px] truncate text-xs text-slate-400" title={j.overrideBrandName ?? ""}>
                      {j.overrideBrandName?.trim() ? (
                        <span className="text-indigo-300/90">{j.overrideBrandName}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-slate-400">
                      {j.sourceType}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(j.status)}`}
                      >
                        {j.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${usageBadgeClass(j.usageStatus)}`}
                      >
                        {j.usageStatus === "passive" ? "Passive" : "Active"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{j.totalRows}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-emerald-400/90">
                      {j.successRows}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-red-400/80">
                      {j.failedRows}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-400">
                      {formatDate(j.createdAt)}
                    </td>
                    <td className="py-2 space-x-2 whitespace-nowrap">
                      {j.usageStatus === "active" ? (
                        <button
                          type="button"
                          onClick={() => changeUsageStatus(j.id, "deactivate")}
                          disabled={rowActionLoading !== null}
                          className="text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
                        >
                          Pasife al
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => changeUsageStatus(j.id, "activate")}
                          disabled={rowActionLoading !== null}
                          className="text-xs text-emerald-300 hover:text-emerald-200 disabled:opacity-50"
                        >
                          Aktif et
                        </button>
                      )}
                      <Link
                        href={`/imports/${j.id}`}
                        className="text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        Detay
                      </Link>
                      {j.usageStatus === "active" && (
                        <Link
                          href={`/imports/${j.id}/trendyol-suggestions`}
                          className="text-xs text-amber-400/90 hover:text-amber-300"
                        >
                          Trendyol AI
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteImport(j.id, j.originalFileName)}
                        disabled={rowActionLoading !== null}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ImportsPage() {
  return (
    <ClientPagePermissionGuard permission="imports.manage">
      <ImportsPageContent />
    </ClientPagePermissionGuard>
  );
}
