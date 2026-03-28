"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { Modal } from "@/components/ui/modal";

type Toast =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

type PackageStatus =
  | string
  | null
  | undefined; /* DB value comes from Trendyol */

type Props = {
  orderId: string;
  shipmentPackageId: string;
  packageStatus: PackageStatus;
  canManageOrders: boolean;
  lines: Array<{
    id: string;
    lineId: string | null;
    stockCode: string | null;
    productName: string | null;
    quantity: number;
  }>;
};

function buildActionEndpoint(orderId: string, action: string) {
  return `/api/orders/${encodeURIComponent(orderId)}/actions/${action}`;
}

const PACKAGE_STATUS_TR: Record<string, string> = {
  Created: "Oluşturuldu",
  Picking: "Hazırlanıyor",
  Invoiced: "Faturalandı",
  Shipped: "Kargoya verildi",
  Delivered: "Teslim edildi",
  Cancelled: "İptal edildi",
  UnSupplied: "Tedarik edilemedi",
  Returned: "İade edildi",
  Repack: "Yeniden paketleme",
  UnPacked: "Parçalandı"
};

function packageStatusTR(v: string | null | undefined) {
  if (!v) return "—";
  return PACKAGE_STATUS_TR[v] ?? v;
}

export function OrdersPackageActionsClient({
  orderId,
  shipmentPackageId,
  packageStatus,
  canManageOrders,
  lines
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [reasonId, setReasonId] = useState("500");
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<null | "picking" | "invoiced" | "unsupplied">(
    null
  );

  async function sendAction(endpoint: string, body?: unknown) {
    setToast(null);
    setLoadingAction(endpoint);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        const msg =
          (data as any)?.error && typeof (data as any)?.error === "string"
            ? (data as any).error
            : "İşlem tamamlanamadı. Lütfen tekrar deneyin.";
        setToast({ type: "error", message: msg });
        return;
      }
      const msg =
        (data as any)?.success === true
          ? "İşlem tamamlandı."
          : (data as any)?.error ?? "İşlem tamamlanamadı.";
      setToast({ type: "success", message: msg });
      router.refresh();
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "Beklenmeyen hata."
      });
    } finally {
      setLoadingAction(null);
    }
  }

  const status = packageStatus ?? null;
  const showPicking = status === "Created";
  const showInvoiced = status === "Picking";
  const showUnsupplied = status === "Created" || status === "Picking" || status === "Invoiced";
  const selectedLinesPayload = lines
    .filter((l) => selectedLineIds.includes(l.id))
    .map((l) => ({ lineId: l.lineId, quantity: l.quantity }));

  if (!canManageOrders) {
    return (
      <div className="card">
        <div className="text-sm font-semibold text-slate-100">Paket Aksiyonları</div>
        <p className="mt-2 text-sm text-slate-400">
          Aksiyonlar için <code className="text-slate-300">orders.manage</code> izni gerekir.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            toast.type === "success"
              ? "border-emerald-700/60 bg-emerald-950/95 text-emerald-100"
              : "border-red-800/70 bg-red-950/95 text-red-100"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}

      <div className="card">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">
              Operasyonlar
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Paket: <span className="font-mono text-slate-300">{shipmentPackageId}</span>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Mevcut durum:{" "}
            <span className="text-slate-300">
              {packageStatusTR(status)}
            </span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {showPicking && (
            <button
              type="button"
              className="btn-primary"
              disabled={loadingAction !== null}
              onClick={() => setConfirmAction("picking")}
            >
              Picking
            </button>
          )}

          {showInvoiced && (
            <button
              type="button"
              className="btn-primary"
              disabled={loadingAction !== null}
              onClick={() => setConfirmAction("invoiced")}
            >
              Invoiced
            </button>
          )}

          {showUnsupplied && (
            <button
              type="button"
              className="btn-secondary"
              disabled={loadingAction !== null}
              onClick={() => setConfirmAction("unsupplied")}
            >
              Unsupplied
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 border-t border-slate-700 pt-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Fatura bilgisi (opsiyonel)</div>
            <input
              className="input"
              placeholder="Fatura numarası"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
            />
            <p className="text-xs text-slate-500">
              Invoiced aksiyonunda opsiyonel olarak gönderilir.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Satır bazlı operasyon</div>
            <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-700 p-2">
              {lines.map((line) => (
                <label key={line.id} className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={selectedLineIds.includes(line.id)}
                    onChange={(e) =>
                      setSelectedLineIds((prev) =>
                        e.target.checked ? [...prev, line.id] : prev.filter((x) => x !== line.id)
                      )
                    }
                  />
                  <span className="truncate">
                    {line.stockCode ?? "—"} · {line.productName ?? "—"} · {line.quantity}
                  </span>
                </label>
              ))}
            </div>
            <input
              className="input"
              placeholder="Reason ID (varsayılan 500)"
              value={reasonId}
              onChange={(e) => setReasonId(e.target.value)}
            />
          </div>
        </div>
      </div>

      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction === "picking"
            ? "Picking Onayı"
            : confirmAction === "invoiced"
              ? "Invoiced Onayı"
              : "Unsupplied Onayı"
        }
      >
        <div className="space-y-3 text-sm text-slate-300">
          <p>
            {confirmAction === "picking"
              ? "Paket Picking durumuna alınacak."
              : confirmAction === "invoiced"
                ? "Paket Invoiced durumuna alınacak."
                : "Seçili satırlar için Unsupplied işlemi Trendyol'a gönderilecek."}
          </p>
          {confirmAction === "unsupplied" && (
            <div className="text-xs text-slate-400">
              {selectedLinesPayload.length > 0
                ? `${selectedLinesPayload.length} satır seçildi.`
                : "Satır seçilmediyse tüm paket satırları işlenir."}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setConfirmAction(null)}>
              Vazgeç
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                if (!action) return;
                if (action === "picking") {
                  void sendAction(buildActionEndpoint(orderId, "picking"));
                  return;
                }
                if (action === "invoiced") {
                  void sendAction(buildActionEndpoint(orderId, "invoiced"), {
                    invoiceNumber: invoiceNumber.trim() || undefined
                  });
                  return;
                }
                void sendAction(buildActionEndpoint(orderId, "unsupplied"), {
                  reasonId: Number(reasonId) || 500,
                  lines: selectedLinesPayload.length > 0 ? selectedLinesPayload : undefined
                });
              }}
            >
              Onayla
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

