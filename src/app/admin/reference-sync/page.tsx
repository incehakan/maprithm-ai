"use client";

import { useEffect, useState } from "react";
import {
  EmptyState,
  PageHeader,
  PanelSurface,
  PremiumButton,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

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
  const [runningAction, setRunningAction] = useState<
    "all" | "brands" | "categories" | "attributes" | null
  >(null);
  const [status, setStatus] = useState<SyncStatus>(null);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/reference-sync");
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Yükleme hatası"));
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

  async function runSyncAction(
    action: "all" | "brands" | "categories" | "attributes"
  ) {
    setRunningAction(action);
    setMessage(null);
    try {
      const requestMap: Record<
        typeof action,
        { url: string; init?: RequestInit; successMessage: string }
      > = {
        all: {
          url: "/api/admin/reference-sync",
          init: { method: "POST" },
          successMessage: "Global referans senkronu tamamlandı."
        },
        brands: {
          url: "/api/integrations/trendyol/sync-brands",
          init: { method: "POST" },
          successMessage: "Marka senkronu tamamlandı."
        },
        categories: {
          url: "/api/integrations/trendyol/sync-categories",
          init: { method: "POST" },
          successMessage: "Kategori senkronu tamamlandı."
        },
        attributes: {
          url: "/api/integrations/trendyol/sync-category-attributes",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ syncAllLeafCategories: true })
          },
          successMessage: "Kategori özellik/değer senkronu tamamlandı."
        }
      };
      const req = requestMap[action];
      const res = await fetch(req.url, req.init);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(extractApiErrorMessage(data, "Sync başarısız"));
      }
      setMessage(
        typeof data.message === "string" && data.message
          ? data.message
          : req.successMessage
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync başarısız");
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reference Sync Yönetimi"
        subtitle="Global Trendyol referans senkronunu gözlemleyin ve manuel tetikleyin."
      />
      <PanelSurface className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Global Referans Sync</h2>
          <PremiumButton
            onClick={() => runSyncAction("all")}
            disabled={runningAction !== null}
          >
            {runningAction === "all" ? "Çalışıyor..." : "Toplu Senkron Et"}
          </PremiumButton>
        </div>
        <p className="text-sm text-slate-400">
          Günlük cron ile otomatik çalışır. Normal mağaza kullanıcıları bu ekranı göremez.
        </p>
        <div className="grid gap-2 sm:grid-cols-3">
          <PremiumButton
            variant="secondary"
            onClick={() => runSyncAction("brands")}
            disabled={runningAction !== null}
          >
            {runningAction === "brands" ? "Markalar çekiliyor..." : "Sadece Markaları Çek"}
          </PremiumButton>
          <PremiumButton
            variant="secondary"
            onClick={() => runSyncAction("categories")}
            disabled={runningAction !== null}
          >
            {runningAction === "categories"
              ? "Kategoriler çekiliyor..."
              : "Sadece Kategorileri Çek"}
          </PremiumButton>
          <PremiumButton
            variant="secondary"
            onClick={() => runSyncAction("attributes")}
            disabled={runningAction !== null}
          >
            {runningAction === "attributes"
              ? "Özellikler çekiliyor..."
              : "Sadece Alt Özellikleri Çek"}
          </PremiumButton>
        </div>
        {message && (
          <div className="rounded-md border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm">
            {message}
          </div>
        )}
        {loading ? (
          <div className="text-sm text-slate-400">Yükleniyor...</div>
        ) : status ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-sm">
            <div>Bağlantı: {status.isActive ? "Aktif" : "Pasif"}</div>
            <div>
              Son sync:{" "}
              {status.lastSyncAt
                ? new Date(status.lastSyncAt).toLocaleString("tr-TR")
                : "—"}
            </div>
            <div className="mt-1">
              Sonuç:{" "}
              <StatusBadge variant={status.lastSyncStatus === "success" ? "success" : status.lastSyncStatus === "failed" ? "danger" : "default"}>
                {status.lastSyncStatus ?? "—"}
              </StatusBadge>
            </div>
            <div className="text-slate-400">{status.lastSyncMessage ?? "—"}</div>
          </div>
        ) : (
          <EmptyState
            title="Sistem bağlantısı bulunamadı"
            description="Önce system connection ayarını tamamlayın."
            ctaHref="/admin/system-connections"
            ctaLabel="Bağlantıyı aç"
          />
        )}
      </PanelSurface>

      <PanelSurface className="space-y-3">
        <SectionHeader title="Son Loglar" />
        <div className="space-y-2">
          {logs.length === 0 && (
            <EmptyState
              title="Log kaydı yok"
              description="Senkron çalıştığında burada geçmiş kayıtlar görünecek."
            />
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
              <div className="text-slate-300">
                <StatusBadge
                  variant={
                    log.status === "success"
                      ? "success"
                      : log.status === "failed"
                        ? "danger"
                        : "default"
                  }
                >
                  {log.status}
                </StatusBadge>
              </div>
              {log.message && <div className="text-slate-400">{log.message}</div>}
            </div>
          ))}
        </div>
      </PanelSurface>
    </div>
  );
}

