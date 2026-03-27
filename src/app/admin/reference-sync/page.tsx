"use client";

import { useEffect, useState } from "react";

type SyncLog = {
  id: string;
  action: string;
  status: string;
  message: string | null;
  summary: Record<string, unknown> | null;
  createdAt: string;
};

type SyncStatus = {
  isActive: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
} | null;

export default function AdminReferenceSyncPage() {
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<SyncStatus>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reference-sync");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Yükleme hatası");
      setStatus(data.status ?? null);
      setLogs((data.logs ?? []) as SyncLog[]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function syncNow() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reference-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || "Sync başarısız");
      }
      setMessage("Global referans senkronu tamamlandı.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync başarısız");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Global Referans Sync</h2>
          <button className="btn-primary" onClick={syncNow} disabled={running}>
            {running ? "Çalışıyor..." : "Şimdi Senkron Et"}
          </button>
        </div>
        <p className="text-sm text-slate-400">
          Günlük cron ile otomatik çalışır. Normal mağaza kullanıcıları bu ekranı göremez.
        </p>
        {message && (
          <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm">
            {message}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-slate-400">Yükleniyor...</div>
        ) : status ? (
          <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2 text-sm">
            <div>Bağlantı: {status.isActive ? "Aktif" : "Pasif"}</div>
            <div>
              Son sync:{" "}
              {status.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleString("tr-TR")
                : "—"}
            </div>
            <div>Son sonuç: {status.lastSyncStatus ?? "—"}</div>
            <div className="text-slate-400">{status.lastSyncMessage ?? "—"}</div>
          </div>
        ) : (
          <div className="text-amber-300">Sistem bağlantısı bulunamadı.</div>
        )}
      </div>

      <div className="card space-y-3">
        <h3 className="text-sm font-semibold">Son Loglar</h3>
        <div className="space-y-2">
          {logs.length === 0 && (
            <div className="text-sm text-slate-400">Kayıt bulunamadı.</div>
          )}
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-md border border-slate-700 bg-slate-900/30 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-200">{log.action}</span>
                <span className="text-slate-400">
                  {new Date(log.createdAt).toLocaleString("tr-TR")}
                </span>
              </div>
              <div className="text-slate-300">{log.status}</div>
              {log.message && <div className="text-slate-400">{log.message}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

