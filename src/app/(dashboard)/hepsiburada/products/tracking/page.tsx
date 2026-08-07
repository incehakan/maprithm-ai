"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { HepsiburadaProductStatusBadge } from "@/components/hepsiburada/HepsiburadaProductStatusBadge";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

function TrackingPageInner() {
  const search = useSearchParams();
  const initial = search.get("trackingId") ?? "";
  const [trackingId, setTrackingId] = useState(initial);
  const [history, setHistory] = useState<Array<{ createdDate?: string; trackingId?: string }>>([]);
  const [statusRows, setStatusRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/hepsiburada/products/tracking-history?page=0&size=50");
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Geçmiş alınamadı."));
      const envelope = data?.data ?? {};
      const list = Array.isArray(envelope.data) ? envelope.data : [];
      setHistory(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geçmiş hatası");
    }
  }, []);

  const loadStatus = useCallback(async (id: string) => {
    if (!id.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/products/status/${encodeURIComponent(id.trim())}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Durum alınamadı."));
      const envelope = data?.data ?? {};
      const list = Array.isArray(envelope.data) ? envelope.data : [];
      setStatusRows(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Durum hatası");
      setStatusRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    if (initial) void loadStatus(initial);
  }, [loadHistory, loadStatus, initial]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Import Tracking</h1>
          <p className="mt-1 text-sm text-slate-400">
            trackingId geçmişi ve durum sorgusu (status / trackingId-history).
          </p>
        </div>
        <Link href="/hepsiburada/products" className="text-sm text-indigo-400 hover:underline">
          ← Ürün listesi
        </Link>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <label className="label">trackingId</label>
          <Input value={trackingId} onChange={(e) => setTrackingId(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={loading || !trackingId.trim()}
          onClick={() => void loadStatus(trackingId)}
        >
          {loading ? "Sorgulanıyor…" : "Durumu Sorgula"}
        </button>
      </Card>

      {statusRows.length > 0 ? (
        <Card className="overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold text-slate-100">Durum kalemleri</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs text-slate-400">
              <tr>
                <th className="py-2 pr-2">merchantSku</th>
                <th className="py-2 pr-2">hbSku</th>
                <th className="py-2 pr-2">importStatus</th>
                <th className="py-2 pr-2">productStatus</th>
                <th className="py-2">ürün</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {statusRows.map((r, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2 font-mono text-xs">{String(r.merchantSku ?? "—")}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{String(r.hbSku ?? "—")}</td>
                  <td className="py-2 pr-2">{String(r.importStatus ?? "—")}</td>
                  <td className="py-2 pr-2">
                    <HepsiburadaProductStatusBadge status={String(r.productStatus ?? "")} />
                  </td>
                  <td className="py-2 text-slate-300">{String(r.productName ?? "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      <Card className="overflow-x-auto">
        <h2 className="mb-2 text-sm font-semibold text-slate-100">Tracking geçmişi</h2>
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2 pr-2">createdDate</th>
              <th className="py-2 pr-2">trackingId</th>
              <th className="py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {history.map((h, i) => (
              <tr key={i}>
                <td className="py-2 pr-2 text-slate-400">{h.createdDate ?? "—"}</td>
                <td className="py-2 pr-2 font-mono text-xs text-slate-200">{h.trackingId ?? "—"}</td>
                <td className="py-2 text-right">
                  {h.trackingId ? (
                    <button
                      type="button"
                      className="text-indigo-400 hover:underline"
                      onClick={() => {
                        setTrackingId(h.trackingId!);
                        void loadStatus(h.trackingId!);
                      }}
                    >
                      Sorgula
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {history.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-6 text-center text-slate-500">
                  Kayıt yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function HepsiburadaTrackingPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <Suspense fallback={<div className="text-sm text-slate-400">Yükleniyor…</div>}>
        <TrackingPageInner />
      </Suspense>
    </ClientPagePermissionGuard>
  );
}
