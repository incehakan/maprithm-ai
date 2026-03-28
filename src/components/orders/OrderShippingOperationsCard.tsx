"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmptyState,
  PanelSurface,
  PremiumButton,
  SectionHeader,
  StatusBadge
} from "@/components/premium/design-system";
import { PremiumInput, PremiumSelect } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";

type CarrierOpt = { providerCode: string; providerName: string };

type ShippingEventRow = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};

type Props = {
  orderId: string;
  shipmentPackageId: string;
  canManage: boolean;
  cargoProviderCode: string | null;
  cargoProviderName: string | null;
  cargoSenderNumber: string | null;
  cargoTrackingNumber: string | null;
  cargoTrackingLink: string | null;
  trackingUpdatedAt: string | null;
  cargoProviderChangedAt: string | null;
  labelFetchedAt: string | null;
  cargoLabelUrl: string | null;
  shippingOperationStatus: string | null;
  shippingOperationLastErrorMessage: string | null;
  shippingEvents: ShippingEventRow[];
};

export function OrderShippingOperationsCard(props: Props) {
  const router = useRouter();
  const [carriers, setCarriers] = useState<CarrierOpt[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; text: string } | null>(
    null
  );

  const [trackTn, setTrackTn] = useState(props.cargoTrackingNumber ?? "");
  const [trackProvider, setTrackProvider] = useState(props.cargoProviderCode ?? "");
  const [trackSender, setTrackSender] = useState(props.cargoSenderNumber ?? "");

  const [chgProvider, setChgProvider] = useState(props.cargoProviderCode ?? "");

  const [confirmTrack, setConfirmTrack] = useState(false);

  useEffect(() => {
    let c = false;
    void (async () => {
      try {
        const res = await fetch("/api/integrations/trendyol/carrier-companies");
        const data = await safeParseJsonResponse(res);
        if (!res.ok || !data || (data as { success?: boolean }).success !== true) return;
        const list = (data as { carriers?: CarrierOpt[] }).carriers ?? [];
        if (!c) setCarriers(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      c = true;
    };
  }, []);

  const opBadge = (() => {
    const s = props.shippingOperationStatus ?? "";
    if (s === "success") return { variant: "success" as const, label: "Tamam" };
    if (s === "error") return { variant: "danger" as const, label: "Hata" };
    if (s === "pending") return { variant: "warning" as const, label: "İşleniyor" };
    return { variant: "default" as const, label: s || "—" };
  })();

  const hasLabel = Boolean(props.cargoLabelUrl?.trim());

  async function postTracking() {
    if (!trackTn.trim() || !trackProvider.trim()) {
      setAlert({ variant: "error", text: "Takip numarası ve sağlayıcı kodu gerekli." });
      return;
    }
    setLoading("track");
    setAlert(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(props.orderId)}/shipping/update-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackingNumber: trackTn.trim(),
          providerCode: trackProvider.trim(),
          cargoSenderNumber: trackSender.trim() || undefined
        })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "Güncelleme başarısız."
        });
        return;
      }
      setAlert({ variant: "success", text: "Takip bilgisi Trendyol’a iletildi." });
      setConfirmTrack(false);
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postChangeProvider() {
    if (!chgProvider.trim()) {
      setAlert({ variant: "error", text: "Sağlayıcı seçin." });
      return;
    }
    setLoading("provider");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(props.orderId)}/shipping/change-provider`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerCode: chgProvider.trim() })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "İşlem başarısız."
        });
        return;
      }
      setAlert({ variant: "success", text: "Kargo sağlayıcı güncellendi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postLabel() {
    setLoading("label");
    setAlert(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(props.orderId)}/shipping/get-label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "Etiket alınamadı."
        });
        return;
      }
      setAlert({ variant: "success", text: "Etiket bilgisi güncellendi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <PanelSurface>
      <SectionHeader title="Kargo operasyonları" />
      <p className="mb-4 text-xs text-slate-500">
        Paket kimliği:{" "}
        <span className="font-mono text-slate-300">{props.shipmentPackageId}</span>
      </p>

      <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-slate-500">Taşıyıcı</dt>
          <dd className="text-slate-200">
            {props.cargoProviderName ?? "—"}{" "}
            {props.cargoProviderCode ? (
              <span className="font-mono text-xs text-slate-500">
                ({props.cargoProviderCode})
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gönderen no (cargo sender)</dt>
          <dd className="font-mono text-slate-300">{props.cargoSenderNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Takip numarası</dt>
          <dd className="font-mono text-slate-300">{props.cargoTrackingNumber ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Son takip güncellemesi</dt>
          <dd className="text-xs text-slate-400">
            {props.trackingUpdatedAt
              ? new Date(props.trackingUpdatedAt).toLocaleString("tr-TR")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Sağlayıcı değişimi</dt>
          <dd className="text-xs text-slate-400">
            {props.cargoProviderChangedAt
              ? new Date(props.cargoProviderChangedAt).toLocaleString("tr-TR")
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Etiket / operasyon</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <StatusBadge variant={hasLabel ? "success" : "default"}>
              {hasLabel ? "Etiket var" : "Etiket yok"}
            </StatusBadge>
            <StatusBadge variant={opBadge.variant}>{opBadge.label}</StatusBadge>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-slate-500">Son etiket çekimi</dt>
          <dd className="text-xs text-slate-400">
            {props.labelFetchedAt
              ? new Date(props.labelFetchedAt).toLocaleString("tr-TR")
              : "—"}
          </dd>
        </div>
        {props.shippingOperationLastErrorMessage && (
          <div className="sm:col-span-2 rounded-lg border border-red-900/50 bg-red-950/30 p-2 text-xs text-red-200">
            {props.shippingOperationLastErrorMessage}
          </div>
        )}
      </dl>

      <div className="mb-4 flex flex-wrap gap-2">
        {props.cargoTrackingLink?.startsWith("http") && (
          <a
            href={props.cargoTrackingLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-indigo-500/40 px-3 py-1.5 text-xs text-indigo-200 hover:bg-indigo-950/40"
          >
            Kargoyu takip et
          </a>
        )}
        {hasLabel && props.cargoLabelUrl?.startsWith("http") && (
          <a
            href={props.cargoLabelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-950/40"
          >
            Etiketi aç
          </a>
        )}
      </div>

      {!props.canManage ? (
        <EmptyState
          title="Salt okunur"
          description="Kargo güncellemeleri için orders.manage izni gerekir."
        />
      ) : (
        <div className="space-y-6 border-t border-white/10 pt-4">
          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">Takip numarası güncelle</div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="text-xs text-slate-500">
                Takip no *
                <PremiumInput
                  className="mt-1"
                  value={trackTn}
                  onChange={(e) => setTrackTn(e.target.value)}
                />
              </label>
              <label className="text-xs text-slate-500">
                Sağlayıcı kodu *
                <PremiumSelect
                  className="mt-1"
                  value={trackProvider}
                  onChange={(e) => setTrackProvider(e.target.value)}
                >
                  <option value="">Seçin…</option>
                  {carriers.map((c) => (
                    <option key={c.providerCode} value={c.providerCode}>
                      {c.providerName} ({c.providerCode})
                    </option>
                  ))}
                </PremiumSelect>
              </label>
              <label className="text-xs text-slate-500">
                Gönderen no (opsiyonel)
                <PremiumInput
                  className="mt-1"
                  value={trackSender}
                  onChange={(e) => setTrackSender(e.target.value)}
                  placeholder="Boşsa takip no kullanılır"
                />
              </label>
            </div>
            <div className="mt-2">
              <PremiumButton
                type="button"
                variant="primary"
                disabled={loading !== null}
                onClick={() => setConfirmTrack(true)}
              >
                Gönder
              </PremiumButton>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">Kargo sağlayıcı değiştir</div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-slate-500">
                Yeni sağlayıcı
                <PremiumSelect
                  className="mt-1 min-w-[220px]"
                  value={chgProvider}
                  onChange={(e) => setChgProvider(e.target.value)}
                >
                  <option value="">Seçin…</option>
                  {carriers.map((c) => (
                    <option key={`chg-${c.providerCode}`} value={c.providerCode}>
                      {c.providerName}
                    </option>
                  ))}
                </PremiumSelect>
              </label>
              <PremiumButton
                type="button"
                variant="secondary"
                disabled={loading !== null}
                onClick={() => void postChangeProvider()}
              >
                Uygula
              </PremiumButton>
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">Ortak etiket</div>
            <PremiumButton
              type="button"
              variant="secondary"
              disabled={loading !== null}
              onClick={() => void postLabel()}
            >
              {loading === "label" ? "…" : "Etiketi getir"}
            </PremiumButton>
            <p className="mt-1 text-[11px] text-slate-500">
              Trendyol ortak etiket servisi; paket durumu ve taşıyıcıya göre kısıtlanabilir.
            </p>
          </div>

          {alert && (
            <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">
              {alert.text}
            </Alert>
          )}
        </div>
      )}

      {props.shippingEvents.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="mb-2 text-xs font-medium text-slate-400">Kargo işlem geçmişi</div>
          <ul className="space-y-2 text-xs">
            {props.shippingEvents.map((ev) => (
              <li key={ev.id} className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
                <span className="font-mono text-indigo-300">{ev.action}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-slate-400">
                  {new Date(ev.createdAt).toLocaleString("tr-TR")}
                </span>
                <div className="text-slate-300">{ev.message}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={confirmTrack} onClose={() => setConfirmTrack(false)} title="Takip güncellemesi">
        <p className="text-sm text-slate-300">
          Trendyol&apos;a takip bilgisi gönderilecek. Devam edilsin mi?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <PremiumButton type="button" variant="secondary" onClick={() => setConfirmTrack(false)}>
            Vazgeç
          </PremiumButton>
          <PremiumButton
            type="button"
            variant="primary"
            disabled={loading === "track"}
            onClick={() => void postTracking()}
          >
            Onayla
          </PremiumButton>
        </div>
      </Modal>
    </PanelSurface>
  );
}
