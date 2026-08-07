"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { HepsiburadaListingStatusBadges } from "@/components/hepsiburada/HepsiburadaListingStatusBadges";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type ListingRow = {
  HepsiburadaSku: string;
  MerchantSku: string;
  Price: number;
  AvailableStock: number;
  DispatchTime: number;
  IsSalable: boolean;
  IsLocked: boolean;
  IsFrozen: boolean;
  IsSuspended: boolean;
  LockReasons?: string[];
};

function HepsiburadaListingsPageContent() {
  const [offset, setOffset] = useState(0);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [merchantSkuFilter, setMerchantSkuFilter] = useState("");
  const [editSku, setEditSku] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editStock, setEditStock] = useState("");
  const [editDispatch, setEditDispatch] = useState("");
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
      });
      if (merchantSkuFilter.trim()) {
        qs.set("merchantSkus", merchantSkuFilter.trim());
      }
      const res = await fetch(
        `/api/integrations/hepsiburada/listings?${qs.toString()}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Liste alınamadı."));
      }
      const page = data?.data ?? {};
      setRows(Array.isArray(page.listings) ? page.listings : []);
      setTotalCount(typeof page.totalCount === "number" ? page.totalCount : 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [offset, limit, merchantSkuFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function savePriceStock(merchantSku: string) {
    setActionBusy(true);
    setActionMsg(null);
    try {
      const body: Record<string, unknown> = { merchantSku };
      if (editPrice.trim() !== "") body.price = Number(editPrice);
      if (editStock.trim() !== "") body.availableStock = Number(editStock);
      if (editDispatch.trim() !== "") body.dispatchTime = Number(editDispatch);

      const res = await fetch(
        "/api/integrations/hepsiburada/listings/price-stock",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Güncelleme başarısız."));
      }
      setActionMsg(`${merchantSku}: fiyat/stok güncellendi.`);
      setEditSku(null);
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setActionBusy(false);
    }
  }

  async function toggleSalable(sku: string, activate: boolean) {
    setActionBusy(true);
    setActionMsg(null);
    try {
      const path = activate ? "activate" : "deactivate";
      const res = await fetch(
        `/api/integrations/hepsiburada/listings/${encodeURIComponent(sku)}/${path}`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "İşlem başarısız."));
      }
      setActionMsg(
        `${sku}: ${activate ? "aktifleştirme" : "pasifleştirme"} isteği gönderildi (deneysel — HTTP metodu doğrulanmadı).`
      );
      await load();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setActionBusy(false);
    }
  }

  const pageMax = Math.max(0, Math.ceil(totalCount / limit) - 1);
  const pageIndex = Math.floor(offset / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hepsiburada Listeler
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Listing durumu, tekil fiyat/stok güncelleme ve satışa aç/kapat.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/hepsiburada/products" className="btn-secondary text-sm">
            Ürünler
          </Link>
          <Link href="/settings/hepsiburada" className="btn-secondary text-sm">
            Bağlantı ayarları
          </Link>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-400">MerchantSku filtre</span>
            <input
              className="input min-w-[220px]"
              value={merchantSkuFilter}
              onChange={(e) => {
                setOffset(0);
                setMerchantSkuFilter(e.target.value);
              }}
              placeholder="örn. SKU-001"
            />
          </label>
          <button type="button" className="btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
            Yenile
          </button>
        </div>
        {error ? <Alert variant="error">{error}</Alert> : null}
        {actionMsg ? <Alert>{actionMsg}</Alert> : null}
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">MerchantSku</th>
              <th className="px-3 py-2">HB Sku</th>
              <th className="px-3 py-2">Fiyat</th>
              <th className="px-3 py-2">Stok</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-400">
                  Yükleniyor…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-400">
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.HepsiburadaSku}-${row.MerchantSku}`}
                  className="border-b border-slate-800/80 align-top"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.MerchantSku}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.HepsiburadaSku}</td>
                  <td className="px-3 py-2">{row.Price}</td>
                  <td className="px-3 py-2">{row.AvailableStock}</td>
                  <td className="px-3 py-2">
                    <HepsiburadaListingStatusBadges
                      isSalable={row.IsSalable}
                      isLocked={row.IsLocked}
                      isFrozen={row.IsFrozen}
                      isSuspended={row.IsSuspended}
                    />
                    {row.IsLocked ? (
                      <p className="mt-1 max-w-[240px] text-[11px] text-amber-200/90">
                        Kilitli — toplu kilit kaldırma API şeması doğrulanmadı.
                        Satıcı panelinden kaldırın.
                        {row.LockReasons?.length
                          ? ` (${row.LockReasons.join(", ")})`
                          : ""}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-2">
                      {editSku === row.MerchantSku ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs">
                            Fiyat
                            <input
                              className="input mt-0.5 w-24"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                            />
                          </label>
                          <label className="text-xs">
                            Stok
                            <input
                              className="input mt-0.5 w-20"
                              value={editStock}
                              onChange={(e) => setEditStock(e.target.value)}
                            />
                          </label>
                          <label className="text-xs">
                            Kargo gün
                            <input
                              className="input mt-0.5 w-16"
                              value={editDispatch}
                              onChange={(e) => setEditDispatch(e.target.value)}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn-primary text-xs"
                            disabled={actionBusy}
                            onClick={() => void savePriceStock(row.MerchantSku)}
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs"
                            onClick={() => setEditSku(null)}
                          >
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary w-fit text-xs"
                          onClick={() => {
                            setEditSku(row.MerchantSku);
                            setEditPrice(String(row.Price ?? ""));
                            setEditStock(String(row.AvailableStock ?? ""));
                            setEditDispatch(String(row.DispatchTime ?? ""));
                          }}
                        >
                          Fiyat/Stok Güncelle
                        </button>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-secondary text-xs"
                          disabled={actionBusy || !row.HepsiburadaSku}
                          onClick={() =>
                            void toggleSalable(row.HepsiburadaSku, !row.IsSalable)
                          }
                        >
                          {row.IsSalable ? "Satışa Kapat" : "Satışa Aç"}
                        </button>
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200 ring-1 ring-amber-500/30">
                          deneysel — HTTP metodu doğrulanmadı
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between gap-2 text-sm text-slate-400">
        <span>
          Toplam {totalCount} · sayfa {pageIndex + 1}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={offset <= 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Önceki
          </button>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={pageIndex >= pageMax || loading}
            onClick={() => setOffset(offset + limit)}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HepsiburadaListingsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <HepsiburadaListingsPageContent />
    </ClientPagePermissionGuard>
  );
}
