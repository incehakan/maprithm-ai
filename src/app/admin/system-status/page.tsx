"use client";

import { useEffect, useState } from "react";
import {
  PageHeader,
  PanelSurface,
  PremiumButton,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";

type StatusPayload = {
  success: boolean;
  status: "ok" | "degraded" | "error";
  appVersion: string;
  environment: string;
  uptime: number;
  db: string;
  runtimeConfig: { ok: boolean; missing: string[]; warnings: string[] };
  scheduler: {
    orderSyncQueue: {
      queued: number;
      running: number;
      failedLastHour: number;
      stuckRunning: number;
      oldestQueuedAt: string | null;
    };
    lastOrderSyncAt: string | null;
    lastXmlSyncAt: string | null;
    lastReferenceSyncAt: string | null;
    referenceSyncStatus: string | null;
    referenceSyncMessage: string | null;
  };
  recentErrors: Array<{
    id: string;
    action: string;
    message: string;
    createdAt: string;
    storeId: string;
  }>;
  timestamp: string;
};

function fmt(dt?: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("tr-TR");
  } catch {
    return dt;
  }
}

export default function AdminSystemStatusPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StatusPayload | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system-status", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || "System status alınamadı.");
      }
      setData(payload as StatusPayload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "System status alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <PageHeader
        title="System Status"
        subtitle="Production readiness, scheduler sağlık ve son hatalar."
        actions={
          <PremiumButton variant="secondary" onClick={load} disabled={loading}>
            Yenile
          </PremiumButton>
        }
      />

      {error && (
        <PanelSurface>
          <div className="text-sm text-rose-300">{error}</div>
        </PanelSurface>
      )}

      {loading && !data ? (
        <PanelSurface>
          <div className="text-sm text-slate-400">Yükleniyor...</div>
        </PanelSurface>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <PanelSurface>
              <div className="text-xs text-slate-500">Health</div>
              <div className="mt-2">
                <StatusBadge variant={data.status === "ok" ? "success" : "warning"}>
                  {data.status}
                </StatusBadge>
              </div>
            </PanelSurface>
            <PanelSurface>
              <div className="text-xs text-slate-500">Environment</div>
              <div className="mt-2 text-sm text-slate-200">{data.environment}</div>
            </PanelSurface>
            <PanelSurface>
              <div className="text-xs text-slate-500">Version</div>
              <div className="mt-2 text-sm text-slate-200">{data.appVersion}</div>
            </PanelSurface>
            <PanelSurface>
              <div className="text-xs text-slate-500">Uptime</div>
              <div className="mt-2 text-sm text-slate-200">
                {Math.floor(data.uptime)} sn
              </div>
            </PanelSurface>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PanelSurface>
              <SectionHeader title="Scheduler & Jobs" />
              <div className="space-y-2 text-sm text-slate-300">
                <div>Queued: {data.scheduler.orderSyncQueue.queued}</div>
                <div>Running: {data.scheduler.orderSyncQueue.running}</div>
                <div>Failed (1h): {data.scheduler.orderSyncQueue.failedLastHour}</div>
                <div>Stuck: {data.scheduler.orderSyncQueue.stuckRunning}</div>
                <div>Oldest queued: {fmt(data.scheduler.orderSyncQueue.oldestQueuedAt)}</div>
                <div>Son sipariş sync: {fmt(data.scheduler.lastOrderSyncAt)}</div>
                <div>Son XML sync: {fmt(data.scheduler.lastXmlSyncAt)}</div>
                <div>Son reference sync: {fmt(data.scheduler.lastReferenceSyncAt)}</div>
              </div>
            </PanelSurface>

            <PanelSurface>
              <SectionHeader title="Runtime Config" />
              <div className="space-y-2 text-sm">
                <div>
                  <StatusBadge variant={data.runtimeConfig.ok ? "success" : "warning"}>
                    {data.runtimeConfig.ok ? "ok" : "missing"}
                  </StatusBadge>
                </div>
                <div className="text-slate-300">
                  Missing:{" "}
                  {data.runtimeConfig.missing.length > 0
                    ? data.runtimeConfig.missing.join(", ")
                    : "—"}
                </div>
                <div className="text-slate-300">
                  Warnings:{" "}
                  {data.runtimeConfig.warnings.length > 0
                    ? data.runtimeConfig.warnings.join(" | ")
                    : "—"}
                </div>
              </div>
            </PanelSurface>
          </div>

          <PanelSurface>
            <SectionHeader title="Recent Critical Failures" />
            <div className="space-y-2 text-xs">
              {data.recentErrors.length === 0 ? (
                <div className="text-slate-500">Kritik hata kaydı yok.</div>
              ) : (
                data.recentErrors.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2"
                  >
                    <div className="font-mono text-slate-200">{e.action}</div>
                    <div className="text-slate-400">{e.message}</div>
                    <div className="text-slate-500">
                      {fmt(e.createdAt)} · store: {e.storeId}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelSurface>
        </>
      ) : null}
    </div>
  );
}

