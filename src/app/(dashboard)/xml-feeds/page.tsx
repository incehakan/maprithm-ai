"use client";

import { useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type XmlFeed = {
  id: string;
  name: string;
  feedUrl: string;
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSyncedAt?: string | null;
  lastSyncStatus?: string | null;
  lastSyncMessage?: string | null;
  lastSyncProductsUpdated?: number | null;
  lastSyncSkippedCount?: number | null;
  lastSyncPublishedCount?: number | null;
  lastSyncInventoryPushCount?: number | null;
  deactivateMissingFromFeed?: boolean;
  createdAt: string;
  updatedAt: string;
};

function fmtDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("tr-TR", {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return value;
  }
}

function syncStatusLabel(status?: string | null): string {
  if (status === "success") return "Başarılı";
  if (status === "failed") return "Hata";
  return "—";
}

function XmlFeedsPageContent() {
  const [feeds, setFeeds] = useState<XmlFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState(60);
  const [isActive, setIsActive] = useState(true);
  const [deactivateMissingFromFeed, setDeactivateMissingFromFeed] = useState(false);
  const [creating, setCreating] = useState(false);

  const loadFeeds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/xml-feeds");
      const data = await safeParseJsonResponse<{ feeds?: XmlFeed[]; message?: string; error?: string }>(
        res
      );
      if (!res.ok) {
        throw new Error(data?.error || data?.message || "XML feed listesi alınamadı.");
      }
      setFeeds(data?.feeds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "XML feed listesi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeeds();
  }, [loadFeeds]);

  async function createFeed(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/xml-feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          feedUrl,
          syncIntervalMinutes,
          isActive,
          deactivateMissingFromFeed
        })
      });
      const data = await safeParseJsonResponse<{ message?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || data?.message || "XML feed kaydı oluşturulamadı.");
      setName("");
      setFeedUrl("");
      setSyncIntervalMinutes(60);
      setIsActive(true);
      setDeactivateMissingFromFeed(false);
      await loadFeeds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "XML feed kaydı oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(feed: XmlFeed) {
    setBusyId(feed.id);
    setError(null);
    try {
      const res = await fetch(`/api/xml-feeds/${feed.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !feed.isActive })
      });
      const data = await safeParseJsonResponse<{ message?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || data?.message || "Durum güncellenemedi.");
      await loadFeeds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum güncellenemedi.");
    } finally {
      setBusyId(null);
    }
  }

  async function syncNow(feedId: string) {
    setBusyId(feedId);
    setError(null);
    try {
      const res = await fetch(`/api/xml-feeds/${feedId}/sync-now`, { method: "POST" });
      const data = await safeParseJsonResponse<{ message?: string; error?: string }>(res);
      if (!res.ok) throw new Error(data?.error || data?.message || "Senkron başarısız.");
      await loadFeeds();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Senkron başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">XML Feed Senkronizasyonu</h1>
        <p className="text-sm text-slate-400">
          Otomatik senkron: her dakika{" "}
          <code className="text-slate-300">GET /api/cron/xml-feed-sync</code> çağırın (isteğe
          bağlı <code className="text-slate-300">CRON_SECRET</code> ile Bearer koruması).
        </p>
      </div>

      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Yeni XML feed
        </h2>
        <form className="space-y-3" onSubmit={createFeed}>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="label">Feed adı</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label">Senkron aralığı (dk)</label>
              <input
                type="number"
                min={1}
                max={1440}
                className="input"
                value={syncIntervalMinutes}
                onChange={(e) => setSyncIntervalMinutes(Number(e.target.value) || 60)}
              />
            </div>
          </div>
          <div>
            <label className="label">Feed URL</label>
            <input className="input" value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800"
              />
              Aktif
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={deactivateMissingFromFeed}
                onChange={(e) => setDeactivateMissingFromFeed(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800"
              />
              Feed&apos;de artık yoksa ürünü taslak yap (stok 0)
            </label>
          </div>
          <button className="btn-primary" disabled={creating}>
            {creating ? "Kaydediliyor..." : "Feed Kaydet"}
          </button>
        </form>
      </div>

      <div className="card space-y-4">
        <div className="flex items-center justify-between border-b border-slate-700 pb-2">
          <h2 className="text-sm font-semibold text-slate-100">Feed Listesi</h2>
          <button className="text-xs text-indigo-400 hover:text-indigo-300" onClick={loadFeeds}>
            Yenile
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-400">Yükleniyor...</p>
        ) : feeds.length === 0 ? (
          <p className="text-sm text-slate-500">Henüz XML feed tanımlanmadı.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3">Ad</th>
                  <th className="pb-2 pr-3">URL</th>
                  <th className="pb-2 pr-3">Aktif</th>
                  <th className="pb-2 pr-3">Aralık (dk)</th>
                  <th className="pb-2 pr-3">Son senkron</th>
                  <th className="pb-2 pr-3">Sonuç</th>
                  <th className="pb-2 pr-3">DB günc.</th>
                  <th className="pb-2 pr-3">Atlanan</th>
                  <th className="pb-2 pr-3">TY envanter</th>
                  <th className="pb-2 pr-3">TY publish</th>
                  <th className="pb-2">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {feeds.map((feed) => (
                  <tr key={feed.id}>
                    <td className="py-2 pr-3 text-slate-100">{feed.name}</td>
                    <td className="py-2 pr-3 max-w-[320px] truncate text-xs text-slate-400" title={feed.feedUrl}>
                      {feed.feedUrl}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
                          feed.isActive
                            ? "border-emerald-700/40 bg-emerald-900/50 text-emerald-200"
                            : "border-zinc-600 bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {feed.isActive ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">{feed.syncIntervalMinutes}</td>
                    <td className="py-2 pr-3 text-slate-300">{fmtDate(feed.lastSyncedAt)}</td>
                    <td className="py-2 pr-3">
                      <div className="text-xs text-slate-200">
                        <span
                          className={
                            feed.lastSyncStatus === "failed"
                              ? "text-red-300"
                              : feed.lastSyncStatus === "success"
                                ? "text-emerald-300"
                                : "text-slate-400"
                          }
                        >
                          {syncStatusLabel(feed.lastSyncStatus)}
                        </span>
                      </div>
                      <div className="mt-0.5 max-w-[280px] truncate text-xs text-slate-500" title={feed.lastSyncMessage ?? ""}>
                        {feed.lastSyncMessage ?? "—"}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-slate-300">
                      {feed.lastSyncProductsUpdated != null ? feed.lastSyncProductsUpdated : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {feed.lastSyncSkippedCount != null ? feed.lastSyncSkippedCount : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {feed.lastSyncInventoryPushCount != null ? feed.lastSyncInventoryPushCount : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-400">
                      {feed.lastSyncPublishedCount != null ? feed.lastSyncPublishedCount : "—"}
                    </td>
                    <td className="py-2 space-x-2 whitespace-nowrap">
                      <button
                        className="text-xs text-indigo-300 hover:text-indigo-200 disabled:opacity-50"
                        disabled={busyId === feed.id}
                        onClick={() => syncNow(feed.id)}
                      >
                        Şimdi Senkron Et
                      </button>
                      <button
                        className="text-xs text-zinc-300 hover:text-zinc-100 disabled:opacity-50"
                        disabled={busyId === feed.id}
                        onClick={() => toggleActive(feed)}
                      >
                        {feed.isActive ? "Pasife al" : "Aktif et"}
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

export default function XmlFeedsPage() {
  return (
    <ClientPagePermissionGuard permission="feeds.manage">
      <XmlFeedsPageContent />
    </ClientPagePermissionGuard>
  );
}
