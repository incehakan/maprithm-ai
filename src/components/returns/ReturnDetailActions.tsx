"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { PremiumButton, PremiumInput, PremiumSelect } from "@/components/premium/design-system";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";

type Reason = { id: string; name: string; group?: string };

export type ReturnPlatform = "trendyol" | "hepsiburada";

type Props = {
  recordId: string;
  platform: ReturnPlatform;
  claimType?: string;   // HB: "Return" | "MissingItem" | "MissingPart" | ...
  claimStatus?: string; // HB: "AwaitingPreApproval" durumunda ön onay aksiyonu gösterilir
  canManage: boolean;
};

// ── Hepsiburada reject enum (dokümantasyon doğrulaması 2026-08-02) ─────────

const HB_REJECT_REASONS_RETURN: Reason[] = [
  { id: "CustomerReturnedWrongItem",                name: "İade edilen ürün siparişteki ürün değildir" },
  { id: "ProductIsDamaged",                         name: "İade edilen ürün kusurlu/hasarlı" },
  { id: "MissingQuantity",                          name: "İade edilen ürünün adedi eksik" },
  { id: "NoSuchAccessory",                          name: "İade ürün kullanılmış, tekrar satılabilir değil" },
  { id: "BoxIsEmptyWithReport",                     name: "İade paketi boş — tutanak mevcut" },
  { id: "BoxIsEmptyWithoutReport",                  name: "İade paketi boş — tutanak yok" },
  { id: "SomePartsOrSomeAccessoriesOrSomePapersAreMissing", name: "Parça/aksesuar/fatura eksik" },
  { id: "ReturnedProductIsNotDelivered",            name: "İade edilen ürün teslim edilmedi" },
  { id: "NewProductWillBeSent",                     name: "Müşteriye yeni ürün gönderilecek" },
  { id: "ExtraProductHasBeenReturned",              name: "Fazla gönderilen ürün iade edildi" },
  { id: "ProductNotWrong",                          name: "Ürün yanlış değil" },
  { id: "ProductNotDefective",                      name: "Ürün kusurlu değil" },
  { id: "StockProblem",                             name: "Stok sorunu — değişim yapılamıyor" },
  { id: "ReturnedProductHasAccountOrPassword",      name: "Üründe hesap/şifre tanımlı" },
  { id: "MarkedAsServiceProcess",                   name: "Servis/analiz sürecine alınacak" },
  { id: "Other",                                    name: "Diğer" },
];

const HB_REJECT_REASONS_MISSING: Reason[] = [
  { id: "ProductSentComplete",                      name: "Ürün eksiksiz gönderildi" },
  { id: "MissingItemOrPartCannotBeSupplied",        name: "Eksik ürün/parça tedarik edilemiyor" },
  { id: "ClaimedComponentIsNotPartOfTheProduct",    name: "Talep edilen parça paket içeriğinde değil" },
  { id: "InvoiceReplacesWarranty",                  name: "Fatura garanti belgesi yerine geçer" },
  { id: "PartialShipmentMissingPackageWillBeDelivered", name: "Parçalı sevkiyat — eksik paket gelecek" },
  { id: "CustomerProblemSolved",                    name: "Müşteri sorunu çözüldü" },
  { id: "Other",                                    name: "Diğer" },
];

function hbRejectReasons(claimType?: string): Reason[] {
  if (!claimType) return HB_REJECT_REASONS_RETURN;
  const t = claimType.toLowerCase();
  if (t.includes("missing")) return HB_REJECT_REASONS_MISSING;
  return HB_REJECT_REASONS_RETURN;
}

// ── Bileşen ───────────────────────────────────────────────────────────────────

export function ReturnDetailActions({ recordId, platform, claimType, claimStatus, canManage }: Props) {
  const router = useRouter();
  const [loading, setLoading]       = useState<string | null>(null);
  const [alert, setAlert]           = useState<{ variant: "success" | "error"; text: string } | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [trackOpen, setTrackOpen]   = useState(false);

  // Trendyol — dinamik reason listesi
  const [tyReasons, setTyReasons]   = useState<Reason[]>([]);
  const [rejectReasonId, setRejectReasonId] = useState("");
  const [rejectMessage, setRejectMessage]   = useState("");

  // Hepsiburada — statik reason listesi
  const hbReasons = hbRejectReasons(claimType);
  const [hbReasonCode, setHbReasonCode]       = useState(hbReasons[0]?.id ?? "");
  const [hbMerchantStatement, setHbMerchantStatement] = useState("");
  const [hbFinalizedWith, setHbFinalizedWith]         = useState<"Refund" | "Change">("Refund");

  // Trendyol tracking
  const [tn, setTn]     = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const isTrendyol     = platform === "trendyol";
  const isHepsiburada  = platform === "hepsiburada";

  useEffect(() => {
    if (!isTrendyol) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/returns/trendyol/reasons");
        const data = await safeParseJsonResponse(res);
        if (!res.ok || !data || (data as { success?: boolean }).success !== true || cancelled) return;
        const list = (data as { claimIssueReasons?: Reason[] }).claimIssueReasons ?? [];
        setTyReasons(list.map((r) => ({ id: String(r.id), name: r.name })));
        if (list[0]) setRejectReasonId(String(list[0].id));
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isTrendyol]);

  if (!canManage) return null;

  // ── Trendyol işlemleri ────────────────────────────────────────────────────

  async function postTyApprove() {
    setLoading("approve"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/${encodeURIComponent(recordId)}/approve`, { method: "POST" });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Onay başarısız." });
        return;
      }
      setAlert({ variant: "success", text: "Onay Trendyol'a iletildi." });
      router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  async function postTyReject() {
    if (!rejectReasonId.trim()) { setAlert({ variant: "error", text: "Red sebebi seçin." }); return; }
    setLoading("reject"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/${encodeURIComponent(recordId)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimIssueReasonId: rejectReasonId, message: rejectMessage.trim() || undefined })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Red başarısız." });
        return;
      }
      setAlert({ variant: "success", text: "Red Trendyol'a iletildi." });
      setRejectOpen(false); router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  async function postTyTracking() {
    if (!tn.trim() || !code.trim()) {
      setAlert({ variant: "error", text: "Takip no ve kargo sağlayıcı kodu gerekli." }); return;
    }
    setLoading("track"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/${encodeURIComponent(recordId)}/update-rejected-tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: tn.trim(), cargoProviderCode: code.trim(), cargoProviderName: name.trim() || undefined })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Güncelleme başarısız." });
        return;
      }
      setAlert({ variant: "success", text: "Takip bilgisi gönderildi." });
      setTrackOpen(false); router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  // ── Hepsiburada işlemleri ─────────────────────────────────────────────────

  async function postHbPreApprove() {
    setLoading("preapprove"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/hepsiburada/${encodeURIComponent(recordId)}/preapprove`, {
        method: "POST"
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Ön onay başarısız." });
        return;
      }
      setAlert({ variant: "success", text: "Ön onay Hepsiburada'ya iletildi." });
      router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  async function postHbApprove() {
    setLoading("approve"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/hepsiburada/${encodeURIComponent(recordId)}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalizedWith: hbFinalizedWith })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Onay başarısız." });
        return;
      }
      setAlert({ variant: "success", text: `Onay Hepsiburada'ya iletildi (${hbFinalizedWith}).` });
      router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  async function postHbReject() {
    if (!hbReasonCode.trim()) { setAlert({ variant: "error", text: "Red sebebi seçin." }); return; }
    setLoading("reject"); setAlert(null);
    try {
      const res = await fetch(`/api/returns/hepsiburada/${encodeURIComponent(recordId)}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reasonCode: hbReasonCode, message: hbMerchantStatement.trim() || undefined })
      });
      const data = await safeParseJsonResponse(res);
      if (!res.ok || (data as { success?: boolean })?.success !== true) {
        setAlert({ variant: "error", text: (data as { error?: string })?.error ?? "Red başarısız." });
        return;
      }
      setAlert({ variant: "success", text: "Red Hepsiburada'ya iletildi." });
      setRejectOpen(false); router.refresh();
    } catch { setAlert({ variant: "error", text: "İstek başarısız." }); }
    finally { setLoading(null); }
  }

  // ── Render: Trendyol ──────────────────────────────────────────────────────

  if (isTrendyol) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <PremiumButton type="button" variant="primary" disabled={loading !== null} onClick={() => void postTyApprove()}>
            {loading === "approve" ? "…" : "Onayla"}
          </PremiumButton>
          <PremiumButton type="button" variant="secondary" disabled={loading !== null} onClick={() => setRejectOpen(true)}>
            Reddet
          </PremiumButton>
          <PremiumButton type="button" variant="secondary" disabled={loading !== null} onClick={() => setTrackOpen(true)}>
            Red paketi takibi
          </PremiumButton>
        </div>
        {alert && <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">{alert.text}</Alert>}

        <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="İade reddi">
          <div className="space-y-3">
            <label className="block text-xs text-slate-400">
              Sebep
              <PremiumSelect className="mt-1 w-full" value={rejectReasonId} onChange={(e) => setRejectReasonId(e.target.value)}>
                {tyReasons.length === 0
                  ? <option value="">Yükleniyor…</option>
                  : tyReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </PremiumSelect>
            </label>
            <label className="block text-xs text-slate-400">
              Açıklama (opsiyonel)
              <PremiumInput className="mt-1 w-full" value={rejectMessage} onChange={(e) => setRejectMessage(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <PremiumButton type="button" variant="secondary" onClick={() => setRejectOpen(false)}>Vazgeç</PremiumButton>
              <PremiumButton type="button" variant="primary" disabled={loading === "reject"} onClick={() => void postTyReject()}>
                {loading === "reject" ? "…" : "Reddet"}
              </PremiumButton>
            </div>
          </div>
        </Modal>

        <Modal open={trackOpen} onClose={() => setTrackOpen(false)} title="Red paketi kargo takibi">
          <div className="space-y-3 text-xs text-slate-400">
            <label className="block">Takip no<PremiumInput className="mt-1 w-full text-slate-100" value={tn} onChange={(e) => setTn(e.target.value)} /></label>
            <label className="block">Kargo kodu<PremiumInput className="mt-1 w-full text-slate-100" value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <label className="block">Kargo adı (opsiyonel)<PremiumInput className="mt-1 w-full text-slate-100" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <div className="flex justify-end gap-2 pt-2">
              <PremiumButton type="button" variant="secondary" onClick={() => setTrackOpen(false)}>Vazgeç</PremiumButton>
              <PremiumButton type="button" variant="primary" disabled={loading === "track"} onClick={() => void postTyTracking()}>
                {loading === "track" ? "…" : "Gönder"}
              </PremiumButton>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Render: Hepsiburada ───────────────────────────────────────────────────

  if (isHepsiburada) {
    const awaitingPreApproval = (claimStatus ?? "").toLowerCase() === "awaitingpreapproval";

    if (awaitingPreApproval) {
      return (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs text-amber-200">
            Bu talep <span className="font-medium">ön onay</span> bekliyor. Nihai onay/red işlemleri için
            önce ön onay verilmesi gerekiyor.
          </div>
          <div className="flex flex-wrap gap-2">
            <PremiumButton type="button" variant="primary" disabled={loading !== null} onClick={() => void postHbPreApprove()}>
              {loading === "preapprove" ? "…" : "Ön onay ver"}
            </PremiumButton>
          </div>
          {alert && <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">{alert.text}</Alert>}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {/* Onay tipi seçimi */}
        <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400">
          <p className="mb-2 font-medium text-slate-300">Onay türü</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" className="accent-indigo-400" value="Refund" checked={hbFinalizedWith === "Refund"} onChange={() => setHbFinalizedWith("Refund")} />
              Ücret iadesi
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" className="accent-indigo-400" value="Change" checked={hbFinalizedWith === "Change"} onChange={() => setHbFinalizedWith("Change")} />
              Yeni ürün değişim
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PremiumButton type="button" variant="primary" disabled={loading !== null} onClick={() => void postHbApprove()}>
            {loading === "approve" ? "…" : "Onayla"}
          </PremiumButton>
          <PremiumButton type="button" variant="secondary" disabled={loading !== null} onClick={() => setRejectOpen(true)}>
            Reddet
          </PremiumButton>
        </div>
        {alert && <Alert variant={alert.variant === "success" ? "success" : "error"} className="text-sm">{alert.text}</Alert>}

        <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="İade reddi — Hepsiburada">
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Talep tipi: <span className="text-slate-300">{claimType ?? "—"}</span>
              {" — "}{(claimType?.toLowerCase().includes("missing") ? "Eksik ürün/parça" : "İade/Temin")} nedenleri gösteriliyor.
            </p>
            <label className="block text-xs text-slate-400">
              Red sebebi
              <PremiumSelect className="mt-1 w-full" value={hbReasonCode} onChange={(e) => setHbReasonCode(e.target.value)}>
                {hbReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </PremiumSelect>
            </label>
            <label className="block text-xs text-slate-400">
              Merchant açıklaması (MerchantStatement)
              <PremiumInput className="mt-1 w-full" value={hbMerchantStatement} onChange={(e) => setHbMerchantStatement(e.target.value)} placeholder="Zorunlu değil, max 500 karakter" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <PremiumButton type="button" variant="secondary" onClick={() => setRejectOpen(false)}>Vazgeç</PremiumButton>
              <PremiumButton type="button" variant="primary" disabled={loading === "reject"} onClick={() => void postHbReject()}>
                {loading === "reject" ? "…" : "Reddet"}
              </PremiumButton>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // ── Bilinmeyen platform fallback ──────────────────────────────────────────
  return <p className="text-xs text-slate-500">Bu platform için aksiyon paneli mevcut değil.</p>;
}
