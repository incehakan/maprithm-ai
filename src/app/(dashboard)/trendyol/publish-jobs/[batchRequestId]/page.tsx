"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";

type DetailProduct = {
  productId: string;
  productName: string;
  mappingId: string;
  publishStatus: string;
  barcode: string | null;
  stockCode: string | null;
  lastErrorMessage: string | null;
};

type JobInfo = {
  batchStatus: string | null;
  itemCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  batchRequestType: string | null;
  lastSyncMessage: string | null;
  updatedAt: string;
};

function statusBadge(s: string) {
  const x = s.toLowerCase();
  if (x === "published")
    return "bg-emerald-900/50 text-emerald-200 border-emerald-700/40";
  if (x === "sent" || x === "processing")
    return "bg-sky-900/50 text-sky-200 border-sky-700/40";
  if (x === "failed")
    return "bg-red-900/50 text-red-200 border-red-800/40";
  return "bg-slate-800 text-slate-300 border-slate-600";
}

function TrendyolPublishJobDetailPageContent() {
  const params = useParams();
  const raw =
    typeof params?.batchRequestId === "string" ? params.batchRequestId : "";
  const batchRequestId = raw ? decodeURIComponent(raw) : "";

  const [job, setJob] = useState<JobInfo | null>(null);
  const [products, setProducts] = useState<DetailProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!batchRequestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/trendyol/publish-jobs/${encodeURIComponent(batchRequestId)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Yüklenemedi.");
      setJob(data.job);
      setProducts(data.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, [batchRequestId]);

  useEffect(() => {
    load();
  }, [load]);

  async function checkResult() {
    if (!batchRequestId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/trendyol/check-batch-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchRequestId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Senkron başarısız.");
      }
      setSyncMessage(data.message || "Tamamlandı.");
      await load();
    } catch (e) {
      setSyncMessage(
        e instanceof Error ? e.message : "Batch sonucu alınamadı."
      );
    } finally {
      setSyncing(false);
    }
  }

  if (!batchRequestId) {
    return <p className="text-sm text-slate-400">Geçersiz adres.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/trendyol/publish-jobs"
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Batch işleri
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          Batch sonucu
        </h1>
        <p className="mt-1 font-mono text-sm text-indigo-300 break-all">
          {batchRequestId}
        </p>
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-400">
          Trendyol API&apos;den toplu işlem sonucunu çekip eşlemeleri günceller.
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={checkResult}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {syncing ? "Sorgulanıyor…" : "Sonucu kontrol et"}
        </button>
      </div>

      {syncMessage && (
        <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
          {syncMessage}
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : (
        <>
          {job && (
            <div className="card grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
              <div>
                <span className="text-slate-500">Batch durumu: </span>
                {job.batchStatus ?? "—"}
              </div>
              <div>
                <span className="text-slate-500">Tip: </span>
                {job.batchRequestType ?? "—"}
              </div>
              <div>
                <span className="text-slate-500">Öğe sayısı: </span>
                {job.itemCount}
              </div>
              <div>
                <span className="text-slate-500">Başarı / hata / bekleyen: </span>
                {job.successCount} / {job.failedCount} / {job.pendingCount}
              </div>
              {job.lastSyncMessage && (
                <div className="sm:col-span-2 text-xs text-slate-500">
                  {job.lastSyncMessage}
                </div>
              )}
            </div>
          )}

          <div className="card overflow-x-auto">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">
              Bu batch&apos;e bağlı ürünler
            </h2>
            {products.length === 0 ? (
              <p className="text-sm text-slate-500">
                Eşleşen ürün yok (job kaydı olmayabilir).
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs uppercase text-slate-500">
                    <th className="pb-2 pr-2">Ürün</th>
                    <th className="pb-2 pr-2">Yayın durumu</th>
                    <th className="pb-2 pr-2">Barkod / stok</th>
                    <th className="pb-2 pr-2">Hata</th>
                    <th className="pb-2"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {products.map((p) => (
                    <tr key={p.mappingId} className="text-slate-200">
                      <td className="py-2 pr-2 max-w-[200px] truncate font-medium">
                        {p.productName}
                      </td>
                      <td className="py-2 pr-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs capitalize ${statusBadge(p.publishStatus)}`}
                        >
                          {p.publishStatus}
                        </span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-xs text-slate-400">
                        {p.barcode ?? "—"} / {p.stockCode ?? "—"}
                      </td>
                      <td className="py-2 pr-2 text-xs text-amber-200/90 max-w-[240px]">
                        {p.lastErrorMessage ?? "—"}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <Link
                          href={`/products/${p.productId}/edit`}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          Ürün düzenle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function TrendyolPublishJobDetailPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.publish">
      <TrendyolPublishJobDetailPageContent />
    </ClientPagePermissionGuard>
  );
}
