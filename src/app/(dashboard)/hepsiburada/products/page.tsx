"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { HepsiburadaProductStatusBadge } from "@/components/hepsiburada/HepsiburadaProductStatusBadge";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";
import { HB_PRODUCT_STATUS_LABELS_TR } from "@/lib/hepsiburadaProductFormat";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

const STATUSES = Object.keys(HB_PRODUCT_STATUS_LABELS_TR);

function HepsiburadaProductsPageContent() {
  const [status, setStatus] = useState("MATCHED");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<{ totalPages?: number; number?: number }>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        status,
        page: String(page),
        size: "50",
      });
      const res = await fetch(
        `/api/integrations/hepsiburada/products/by-status?${qs.toString()}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Liste alınamadı."));
      }
      const envelope = data?.data ?? {};
      const list = Array.isArray(envelope.data)
        ? envelope.data
        : Array.isArray(envelope)
          ? envelope
          : [];
      setRows(list as Record<string, unknown>[]);
      setMeta({
        totalPages: typeof envelope.totalPages === "number" ? envelope.totalPages : undefined,
        number: typeof envelope.number === "number" ? envelope.number : page,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Hepsiburada Ürünler</h1>
          <p className="mt-1 text-sm text-slate-400">
            Mağaza ürünleri statüye göre listelenir (products-by-merchant-and-status).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hepsiburada/products/import" className="btn-primary text-sm">
            Ürün İçe Aktar
          </Link>
          <Link href="/hepsiburada/products/tracking" className="btn-secondary text-sm">
            Tracking geçmişi
          </Link>
          <Link href="/settings/hepsiburada" className="btn-secondary text-sm">
            Bağlantı ayarları
          </Link>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Statü</label>
          <select
            className="input"
            value={status}
            onChange={(e) => {
              setPage(0);
              setStatus(e.target.value);
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {HB_PRODUCT_STATUS_LABELS_TR[s as keyof typeof HB_PRODUCT_STATUS_LABELS_TR]} ({s})
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void load()} disabled={loading}>
          {loading ? "Yükleniyor…" : "Yenile"}
        </button>
      </Card>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs text-slate-400">
            <tr>
              <th className="py-2 pr-2">SKU / merchantSku</th>
              <th className="py-2 pr-2">hbSku</th>
              <th className="py-2 pr-2">Ürün adı</th>
              <th className="py-2 pr-2">Statü</th>
              <th className="py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((r, idx) => {
              const merchantSku = String(r.merchantSku ?? r.sku ?? "—");
              const hbSku = String(r.hbSku ?? "—");
              const name = String(r.productName ?? r.name ?? "—");
              const st = String(r.productStatus ?? r.status ?? "");
              const trackingId =
                typeof r.trackingId === "string" ? r.trackingId : null;
              return (
                <tr key={`${merchantSku}-${idx}`}>
                  <td className="py-2 pr-2 font-mono text-xs text-slate-200">{merchantSku}</td>
                  <td className="py-2 pr-2 font-mono text-xs text-slate-400">{hbSku}</td>
                  <td className="py-2 pr-2 text-slate-200">{name}</td>
                  <td className="py-2 pr-2">
                    <HepsiburadaProductStatusBadge status={st} />
                  </td>
                  <td className="py-2 text-right">
                    {trackingId ? (
                      <Link
                        href={`/hepsiburada/products/tracking?trackingId=${encodeURIComponent(trackingId)}`}
                        className="text-indigo-400 hover:underline"
                      >
                        Durumu Sorgula
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500">
                  Kayıt yok veya bağlantı/senkron gerekli.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center gap-2 text-sm text-slate-400">
        <button
          type="button"
          className="btn-secondary"
          disabled={page <= 0 || loading}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
        >
          Önceki
        </button>
        <span>
          Sayfa {meta.number ?? page}
          {meta.totalPages != null ? ` / ${meta.totalPages}` : ""}
        </span>
        <button
          type="button"
          className="btn-secondary"
          disabled={loading || (meta.totalPages != null && page + 1 >= meta.totalPages)}
          onClick={() => setPage((p) => p + 1)}
        >
          Sonraki
        </button>
      </div>
    </div>
  );
}

export default function HepsiburadaProductsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <HepsiburadaProductsPageContent />
    </ClientPagePermissionGuard>
  );
}
