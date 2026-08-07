"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  EmptyState,
  PanelSurface,
  PremiumButton,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { PremiumInput } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type LineRow = {
  id: string;
  lineId: number | null;
  stockCode: string | null;
  productName: string | null;
  quantity: number;
};

type Props = {
  orderId: string;
  shipmentPackageId: string;
  canManage: boolean;
  lines: LineRow[];
};

export function OrderAdvancedShippingOperationsCard(props: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; text: string } | null>(
    null
  );

  // Desi / Koli
  const [boxQuantity, setBoxQuantity] = useState("");
  const [deci, setDeci] = useState("");

  // İşçilik bedeli (satır bazlı)
  const [laborCosts, setLaborCosts] = useState<Record<number, string>>({});

  // Depo bilgisi
  const [warehouseId, setWarehouseId] = useState("");

  // Paket bölme
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set());
  const [confirmSplit, setConfirmSplit] = useState(false);

  const linesWithId = props.lines.filter((l): l is LineRow & { lineId: number } => l.lineId != null);

  async function postBoxInfo() {
    const bq = parseInt(boxQuantity, 10);
    const dc = parseFloat(deci);
    if (!Number.isFinite(bq) || bq <= 0 || !Number.isFinite(dc) || dc <= 0) {
      setAlert({ variant: "error", text: "Koli adedi ve desi 0'dan büyük olmalı." });
      return;
    }
    setLoading("box");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(props.orderId)}/shipping/update-box-info`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boxQuantity: bq, deci: dc })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Gönderilemedi." });
        return;
      }
      setAlert({ variant: "success", text: "Desi/koli bilgisi Trendyol'a iletildi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postLaborCosts() {
    const items = Object.entries(laborCosts)
      .map(([lineId, val]) => ({ orderLineId: Number(lineId), laborCostPerItem: parseFloat(val) }))
      .filter((it) => Number.isFinite(it.orderLineId) && Number.isFinite(it.laborCostPerItem) && it.laborCostPerItem >= 0);

    if (items.length === 0) {
      setAlert({ variant: "error", text: "En az bir satır için işçilik bedeli girin." });
      return;
    }
    setLoading("labor");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(props.orderId)}/shipping/labor-costs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Gönderilemedi." });
        return;
      }
      setAlert({ variant: "success", text: "İşçilik bedeli Trendyol'a iletildi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postWarehouse() {
    const wid = parseInt(warehouseId, 10);
    if (!Number.isFinite(wid) || wid <= 0) {
      setAlert({ variant: "error", text: "Geçerli bir depo (warehouse) ID girin." });
      return;
    }
    setLoading("warehouse");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(props.orderId)}/shipping/update-warehouse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ warehouseId: wid })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Gönderilemedi." });
        return;
      }
      setAlert({ variant: "success", text: "Depo bilgisi güncellendi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postSplit() {
    const orderLineIds = Array.from(selectedLineIds);
    setLoading("split");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(props.orderId)}/shipping/split-package`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderLineIds })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Bölme başarısız." });
        return;
      }
      setAlert({
        variant: "success",
        text: (data as { message?: string }).message ?? "Bölme isteği gönderildi."
      });
      setConfirmSplit(false);
      setSelectedLineIds(new Set());
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  function toggleLine(lineId: number) {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  return (
    <PanelSurface>
      <SectionHeader title="Gelişmiş paket işlemleri" />
      <p className="mb-4 text-xs text-slate-500">
        Desi/koli bildirimi, işçilik bedeli (belirli kategoriler), depo güncelleme (Trendyol
        Express) ve paket bölme — Trendyol resmi dokümantasyonuyla doğrulanmıştır.
      </p>

      {!props.canManage ? (
        <EmptyState
          title="Salt okunur"
          description="Bu işlemler için orders.manage izni gerekir."
        />
      ) : (
        <div className="space-y-6">
          {/* Desi / Koli */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">
              Desi ve Koli Bilgisi Bildirimi
              <StatusBadge variant="default" className="ml-2">
                Horoz / CEVA için zorunlu
              </StatusBadge>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-500">
                Koli adedi *
                <PremiumInput
                  className="mt-1"
                  type="number"
                  min={1}
                  value={boxQuantity}
                  onChange={(e) => setBoxQuantity(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-500">
                Desi *
                <PremiumInput
                  className="mt-1"
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={deci}
                  onChange={(e) => setDeci(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <PremiumButton
                  type="button"
                  variant="secondary"
                  disabled={loading !== null}
                  onClick={() => void postBoxInfo()}
                >
                  {loading === "box" ? "…" : "Gönder"}
                </PremiumButton>
              </div>
            </div>
          </div>

          {/* İşçilik bedeli */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">
              İşçilik Bedeli Tutarı Gönderme
              <StatusBadge variant="default" className="ml-2">
                Sadece belirli kategoriler (mücevher/sarrafiye/takı)
              </StatusBadge>
            </div>
            {linesWithId.length === 0 ? (
              <p className="text-xs text-slate-500">Bu pakette lineId bilgisi olan satır yok.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {linesWithId.map((l) => (
                    <div key={l.id} className="grid grid-cols-[1fr_140px] items-center gap-2 text-xs">
                      <span className="truncate text-slate-300" title={l.productName ?? undefined}>
                        {l.productName ?? l.stockCode ?? l.lineId} · lineId {l.lineId}
                      </span>
                      <PremiumInput
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="₺ / adet"
                        value={laborCosts[l.lineId] ?? ""}
                        onChange={(e) =>
                          setLaborCosts((prev) => ({ ...prev, [l.lineId]: e.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2">
                  <PremiumButton
                    type="button"
                    variant="secondary"
                    disabled={loading !== null}
                    onClick={() => void postLaborCosts()}
                  >
                    {loading === "labor" ? "…" : "İşçilik Bedelini Gönder"}
                  </PremiumButton>
                </div>
              </>
            )}
          </div>

          {/* Depo bilgisi */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">
              Depo Bilgisi Güncelleme
              <StatusBadge variant="default" className="ml-2">
                Sadece Trendyol Express
              </StatusBadge>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                Warehouse ID
                <PremiumInput
                  className="mt-1"
                  type="number"
                  min={1}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                />
              </label>
              <PremiumButton
                type="button"
                variant="secondary"
                disabled={loading !== null}
                onClick={() => void postWarehouse()}
              >
                {loading === "warehouse" ? "…" : "Güncelle"}
              </PremiumButton>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Paket durumu Created/Invoiced/Picking dışındaysa Trendyol isteği reddeder.
            </p>
          </div>

          {/* Paket bölme */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-xs font-medium text-slate-400">
              Sipariş Paketlerini Bölme
            </div>
            {linesWithId.length < 2 ? (
              <p className="text-xs text-slate-500">
                Bölmek için pakette en az 2 satır (farklı lineId) olmalı.
              </p>
            ) : (
              <>
                <p className="mb-2 text-[11px] text-slate-500">
                  Ayrı bir pakete taşınacak satırları seçin; işaretlemediğiniz satırlar mevcut
                  pakette kalır (yeni paket asenkron oluşur).
                </p>
                <div className="space-y-1">
                  {linesWithId.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedLineIds.has(l.lineId)}
                        onChange={() => toggleLine(l.lineId)}
                        className="rounded border-slate-600 bg-slate-800"
                      />
                      {l.productName ?? l.stockCode ?? l.lineId} · lineId {l.lineId} · adet{" "}
                      {l.quantity}
                    </label>
                  ))}
                </div>
                <div className="mt-2">
                  <PremiumButton
                    type="button"
                    variant="secondary"
                    disabled={loading !== null || selectedLineIds.size === 0}
                    onClick={() => setConfirmSplit(true)}
                  >
                    Seçilenleri Ayır ve Böl
                  </PremiumButton>
                </div>
              </>
            )}
          </div>

          {alert && (
            <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">
              {alert.text}
            </Alert>
          )}
        </div>
      )}

      <Modal open={confirmSplit} onClose={() => setConfirmSplit(false)} title="Paketi böl">
        <p className="text-sm text-slate-300">
          Seçilen {selectedLineIds.size} satır bu paketten ayrılıp yeni (asenkron oluşacak) bir
          pakete taşınacak. Bu işlem geri alınamaz. Devam edilsin mi?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <PremiumButton type="button" variant="secondary" onClick={() => setConfirmSplit(false)}>
            Vazgeç
          </PremiumButton>
          <PremiumButton
            type="button"
            variant="primary"
            disabled={loading === "split"}
            onClick={() => void postSplit()}
          >
            Onayla
          </PremiumButton>
        </div>
      </Modal>
    </PanelSurface>
  );
}
