"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

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
  cargoTrackingNumber: string | null;
  cargoProviderName: string | null;
  canManageOrders: boolean;
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
  cargoTrackingNumber,
  cargoProviderName,
  canManageOrders
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

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
        const msg = (data as any)?.error ?? "İşlem başarısız.";
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
  const showShipped = status === "Invoiced";
  const canShip =
    Boolean(cargoTrackingNumber && cargoTrackingNumber.trim() !== "") &&
    Boolean(cargoProviderName && cargoProviderName.trim() !== "");

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
              Paket Aksiyonları
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
              onClick={() => {
                void sendAction(buildActionEndpoint(orderId, "picking"));
              }}
            >
              Hazırlanıyor
            </button>
          )}

          {showInvoiced && (
            <button
              type="button"
              className="btn-primary"
              disabled={loadingAction !== null}
              onClick={() => {
                void sendAction(buildActionEndpoint(orderId, "invoiced"));
              }}
            >
              Faturalandı
            </button>
          )}

          {showShipped && (
            <button
              type="button"
              className="btn-primary"
              disabled={loadingAction !== null || !canShip}
              onClick={() => {
                void sendAction(buildActionEndpoint(orderId, "shipped"), {
                  trackingNumber: cargoTrackingNumber,
                  cargoProviderName
                });
              }}
              title={!canShip ? "Kargo takip bilgisi eksik." : undefined}
            >
              Kargoya verildi
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            disabled={loadingAction !== null}
            onClick={() => {
              void sendAction(buildActionEndpoint(orderId, "cancel"));
            }}
          >
            İptal et
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={loadingAction !== null}
            onClick={() => {
              void sendAction(buildActionEndpoint(orderId, "unsupplied"));
            }}
          >
            Tedarik edilemedi
          </button>
        </div>
      </div>
    </div>
  );
}

