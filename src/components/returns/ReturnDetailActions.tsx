"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { PremiumButton } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { PremiumInput, PremiumSelect } from "@/components/premium/design-system";

type IssueReason = { id: string; name: string };

type Props = {
  recordId: string;
  canManage: boolean;
};

export function ReturnDetailActions({ recordId, canManage }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ variant: "success" | "error"; text: string } | null>(
    null
  );
  const [reasons, setReasons] = useState<IssueReason[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReasonId, setRejectReasonId] = useState("");
  const [rejectMessage, setRejectMessage] = useState("");
  const [trackOpen, setTrackOpen] = useState(false);
  const [tn, setTn] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/returns/trendyol/reasons");
        const data = await safeParseJsonResponse(res);
        if (!res.ok || !data || (data as { success?: boolean }).success !== true) return;
        const list = (data as { claimIssueReasons?: IssueReason[] }).claimIssueReasons ?? [];
        if (!cancelled) {
          setReasons(list.map((r) => ({ id: String(r.id), name: r.name })));
          if (list[0]) setRejectReasonId(String(list[0].id));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!canManage) return null;

  async function postApprove() {
    setLoading("approve");
    setAlert(null);
    try {
      const res = await fetch(`/api/returns/${encodeURIComponent(recordId)}/approve`, {
        method: "POST"
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "Onay başarısız."
        });
        return;
      }
      setAlert({ variant: "success", text: "Onay Trendyol’a iletildi." });
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postReject() {
    if (!rejectReasonId.trim()) {
      setAlert({ variant: "error", text: "Red sebebi seçin." });
      return;
    }
    setLoading("reject");
    setAlert(null);
    try {
      const res = await fetch(`/api/returns/${encodeURIComponent(recordId)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claimIssueReasonId: rejectReasonId,
          message: rejectMessage.trim() || undefined
        })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "Red başarısız."
        });
        return;
      }
      setAlert({ variant: "success", text: "Red Trendyol’a iletildi." });
      setRejectOpen(false);
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  async function postTracking() {
    if (!tn.trim() || !code.trim()) {
      setAlert({ variant: "error", text: "Takip no ve kargo sağlayıcı kodu gerekli." });
      return;
    }
    setLoading("track");
    setAlert(null);
    try {
      const res = await fetch(
        `/api/returns/${encodeURIComponent(recordId)}/update-rejected-tracking`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            trackingNumber: tn.trim(),
            cargoProviderCode: code.trim(),
            cargoProviderName: name.trim() || undefined
          })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok || !data || (data as { success?: boolean }).success !== true) {
        setAlert({
          variant: "error",
          text: (data as { error?: string })?.error ?? "Güncelleme başarısız."
        });
        return;
      }
      setAlert({ variant: "success", text: "Takip bilgisi gönderildi." });
      setTrackOpen(false);
      router.refresh();
    } catch {
      setAlert({ variant: "error", text: "İstek başarısız." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <PremiumButton
          type="button"
          variant="primary"
          disabled={loading !== null}
          onClick={() => void postApprove()}
        >
          {loading === "approve" ? "…" : "Onayla (Trendyol)"}
        </PremiumButton>
        <PremiumButton
          type="button"
          variant="secondary"
          disabled={loading !== null}
          onClick={() => setRejectOpen(true)}
        >
          Reddet
        </PremiumButton>
        <PremiumButton
          type="button"
          variant="secondary"
          disabled={loading !== null}
          onClick={() => setTrackOpen(true)}
        >
          Red paketi takibi
        </PremiumButton>
      </div>

      {alert && (
        <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">
          {alert.text}
        </Alert>
      )}

      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="İade reddi">
        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            Claim issue reason
            <PremiumSelect
              className="mt-1 w-full"
              value={rejectReasonId}
              onChange={(e) => setRejectReasonId(e.target.value)}
            >
              {reasons.length === 0 ? (
                <option value="">Önce senkron veya reasons API</option>
              ) : (
                reasons.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))
              )}
            </PremiumSelect>
          </label>
          <label className="block text-xs text-slate-400">
            Açıklama (opsiyonel)
            <PremiumInput
              className="mt-1 w-full"
              value={rejectMessage}
              onChange={(e) => setRejectMessage(e.target.value)}
              placeholder="Kısa açıklama"
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <PremiumButton type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              Vazgeç
            </PremiumButton>
            <PremiumButton
              type="button"
              variant="primary"
              disabled={loading === "reject"}
              onClick={() => void postReject()}
            >
              {loading === "reject" ? "…" : "Reddet"}
            </PremiumButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={trackOpen}
        onClose={() => setTrackOpen(false)}
        title="Red paketi kargo takibi"
      >
        <div className="space-y-3 text-xs text-slate-400">
          <label className="block">
            Takip numarası
            <PremiumInput
              className="mt-1 w-full text-slate-100"
              value={tn}
              onChange={(e) => setTn(e.target.value)}
            />
          </label>
          <label className="block">
            Kargo sağlayıcı kodu
            <PremiumInput
              className="mt-1 w-full text-slate-100"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <label className="block">
            Kargo adı (opsiyonel)
            <PremiumInput
              className="mt-1 w-full text-slate-100"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <PremiumButton type="button" variant="secondary" onClick={() => setTrackOpen(false)}>
              Vazgeç
            </PremiumButton>
            <PremiumButton
              type="button"
              variant="primary"
              disabled={loading === "track"}
              onClick={() => void postTracking()}
            >
              {loading === "track" ? "…" : "Gönder"}
            </PremiumButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
