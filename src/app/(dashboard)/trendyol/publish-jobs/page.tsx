"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type JobRow = {
  id: string;
  batchRequestId: string;
  batchStatus: string | null;
  itemCount: number;
  successCount: number;
  failedCount: number;
  pendingCount: number;
  batchRequestType: string | null;
  updatedAt: string;
};

function TrendyolPublishJobsPageContent() {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trendyol/publish-jobs");
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Liste yüklenemedi."));
      setJobs(data.jobs ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">
          Trendyol batch işleri
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Ürün gönderiminden sonra dönen batch kimlikleri. Detaydan sonucu
          sorgulayabilirsiniz.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-slate-500">
          Henüz kayıtlı batch yok. Ürün düzenlemeden Trendyol&apos;a gönderim
          yaptığınızda burada listelenir.
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs uppercase text-slate-500">
                <th className="pb-2 pr-3">Batch ID</th>
                <th className="pb-2 pr-3">Durum</th>
                <th className="pb-2 pr-3">Tip</th>
                <th className="pb-2 pr-3 text-right">Öğe</th>
                <th className="pb-2 pr-3 text-right">OK / Hata / Bekleyen</th>
                <th className="pb-2 pr-3">Güncellendi</th>
                <th className="pb-2"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {jobs.map((j) => (
                <tr key={j.id} className="text-slate-200">
                  <td className="py-2 pr-3 font-mono text-xs text-indigo-300 max-w-[200px] truncate">
                    {j.batchRequestId}
                  </td>
                  <td className="py-2 pr-3">{j.batchStatus ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-slate-400">
                    {j.batchRequestType ?? "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {j.itemCount}
                  </td>
                  <td className="py-2 pr-3 text-right text-xs tabular-nums text-slate-400">
                    {j.successCount} / {j.failedCount} / {j.pendingCount}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-xs text-slate-500">
                    {new Date(j.updatedAt).toLocaleString("tr-TR")}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/trendyol/publish-jobs/${encodeURIComponent(j.batchRequestId)}`}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      Detay
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TrendyolPublishJobsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.publish">
      <TrendyolPublishJobsPageContent />
    </ClientPagePermissionGuard>
  );
}
