"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { safeParseJsonResponse } from "@/lib/safeParseJsonResponse";
import { Modal } from "@/components/ui/modal";

type InvoiceAttempt = {
  id: string;
  invoiceStatus: string;
  createdAt: string;
  invoiceNumber: string | null;
  lastErrorMessage: string | null;
};

type Props = {
  orderId: string;
  shipmentPackageId: string;
  canManageOrders: boolean;
  /** Trendyol rawData.micro — micro ihracatta ek alanlar gerekir */
  isMicroExport?: boolean;
  invoiceStatus: string | null;
  invoiceLink: string | null;
  invoiceNumber: string | null;
  invoiceDateTime: string | null;
  invoiceSentAt: string | null;
  invoiceLastErrorMessage: string | null;
  recentAttempts: InvoiceAttempt[];
};

function statusBadgeClass(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "sent") return "border-emerald-500/50 bg-emerald-500/10 text-emerald-100";
  if (s === "failed") return "border-red-500/50 bg-red-500/10 text-red-100";
  if (s === "pending") return "border-amber-500/50 bg-amber-500/10 text-amber-100";
  return "border-white/10 bg-white/[0.04] text-slate-300";
}

function statusLabel(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "sent") return "Gönderildi";
  if (s === "failed") return "Hata";
  if (s === "pending") return "Beklemede";
  if (!status) return "Kayıt yok";
  return status;
}

export function OrderInvoiceCardClient({
  orderId,
  shipmentPackageId,
  canManageOrders,
  isMicroExport = false,
  invoiceStatus,
  invoiceLink,
  invoiceNumber,
  invoiceDateTime,
  invoiceSentAt,
  invoiceLastErrorMessage,
  recentAttempts
}: Props) {
  const router = useRouter();
  const [number, setNumber] = useState(invoiceNumber ?? "");
  const [link, setLink] = useState(invoiceLink ?? "");
  const [dt, setDt] = useState(
    invoiceDateTime
      ? invoiceDateTime.slice(0, 16)
      : new Date().toISOString().slice(0, 16)
  );
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileMicroOverride, setFileMicroOverride] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);

  /** Önceki başarılı gönderim zamanı korunur; API hatasından sonra status failed olsa bile yeniden gönderim onayı gerekir */
  const hadSuccessfulSend = invoiceSentAt != null;

  async function submit() {
    setToast(null);
    setLoading(true);
    try {
      const invoiceDateTimeIso = dt ? new Date(dt).toISOString() : new Date().toISOString();
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/actions/send-invoice-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shipmentPackageId,
            invoiceLink: link.trim(),
            invoiceNumber: number.trim(),
            invoiceDateTime: invoiceDateTimeIso
          })
        }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        const msg =
          typeof (data as any)?.error === "string"
            ? (data as any).error
            : "Fatura linki gönderilemedi.";
        setToast({ type: "error", message: msg });
        return;
      }
      const isResend = (data as any)?.isResend === true;
      setToast({
        type: "success",
        message: isResend ? "Fatura linki yeniden gönderildi." : "Fatura linki gönderildi."
      });
      setConfirmResend(false);
      router.refresh();
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "Beklenmeyen hata."
      });
    } finally {
      setLoading(false);
    }
  }

  const effectiveMicro = isMicroExport || fileMicroOverride;

  async function submitFileUpload(file: File) {
    setToast(null);
    setFileLoading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("shipmentPackageId", shipmentPackageId);
      if (effectiveMicro) {
        form.set("isMicroExport", "true");
        form.set("invoiceNumber", number.trim());
        form.set("invoiceDateTime", dt ? new Date(dt).toISOString() : new Date().toISOString());
      }
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderId)}/actions/upload-invoice-file`,
        { method: "POST", body: form }
      );
      const data = await safeParseJsonResponse(res);
      if (!res.ok) {
        const msg =
          typeof (data as { error?: string })?.error === "string"
            ? (data as { error: string }).error
            : "Dosya yüklenemedi.";
        setToast({ type: "error", message: msg });
        return;
      }
      setToast({
        type: "success",
        message: "Fatura dosyası Trendyol'a yüklendi (PDF/JPEG/PNG, max 10 MB)."
      });
      router.refresh();
    } catch (e) {
      setToast({
        type: "error",
        message: e instanceof Error ? e.message : "Beklenmeyen hata."
      });
    } finally {
      setFileLoading(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">Fatura</div>
          <div className="mt-1 text-xs text-slate-500">
            Paket: <span className="font-mono text-slate-300">{shipmentPackageId}</span>
          </div>
        </div>
        <span
          className={`inline-flex w-fit rounded-lg border px-2.5 py-1 text-xs font-medium ${statusBadgeClass(
            invoiceStatus
          )}`}
        >
          {statusLabel(invoiceStatus)}
        </span>
      </div>

      {!invoiceLink &&
        !invoiceNumber &&
        !invoiceSentAt &&
        (invoiceStatus == null || String(invoiceStatus).toLowerCase() !== "failed") && (
          <div className="rounded-xl border border-dashed border-slate-600/60 bg-slate-900/40 px-4 py-6 text-center text-sm text-slate-400">
            Bu paket için henüz Trendyol&apos;a fatura linki gönderilmedi.
            {canManageOrders && " Aşağıdaki formdan ekleyebilirsiniz."}
          </div>
        )}

      <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-300 md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Fatura no</div>
          <div className="mt-0.5 break-all">{invoiceNumber ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Fatura zamanı</div>
          <div className="mt-0.5">{invoiceDateTime ?? "—"}</div>
        </div>
        <div className="md:col-span-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Link</div>
          {invoiceLink ? (
            <a
              href={invoiceLink}
              target="_blank"
              rel="noreferrer"
              className="mt-0.5 inline-block break-all text-indigo-300 hover:text-indigo-200"
            >
              {invoiceLink}
            </a>
          ) : (
            <div className="mt-0.5">—</div>
          )}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Son gönderim</div>
          <div className="mt-0.5">{invoiceSentAt ?? "—"}</div>
        </div>
        {invoiceLastErrorMessage && (
          <div className="md:col-span-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-100">
            {invoiceLastErrorMessage}
          </div>
        )}
      </div>

      {recentAttempts.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-400">Son gönderim denemeleri</div>
          <ul className="max-h-32 space-y-1 overflow-auto text-xs text-slate-400">
            {recentAttempts.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-2 border-b border-slate-800/80 py-1">
                <span>{a.createdAt}</span>
                <span className={a.invoiceStatus === "sent" ? "text-emerald-400" : "text-red-400"}>
                  {a.invoiceStatus}
                </span>
                {a.invoiceNumber && <span className="font-mono text-slate-500">{a.invoiceNumber}</span>}
                {a.lastErrorMessage && (
                  <span className="text-red-300/90">{a.lastErrorMessage}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!canManageOrders ? (
        <p className="text-sm text-slate-500">
          Fatura göndermek için <code className="text-slate-400">orders.manage</code> gerekir.
        </p>
      ) : (
        <>
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

          {hadSuccessfulSend && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              Bu pakete daha önce fatura linki gönderilmiş (
              {invoiceSentAt ?? "?"}). Yeni gönderim önceki kaydı günceller; onay isteyeceğiz.
            </div>
          )}

          <div className="space-y-3 border-t border-slate-700 pt-4">
            <div className="text-xs font-semibold text-slate-300">Fatura linki gönder</div>
            <input
              className="input"
              placeholder="Fatura numarası"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
            <input
              className="input"
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
            />
            <input
              className="input"
              placeholder="https://... fatura PDF veya görüntüleme linki"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary"
              disabled={loading}
              onClick={() => {
                if (hadSuccessfulSend) setConfirmResend(true);
                else void submit();
              }}
            >
              {loading ? "Gönderiliyor…" : "Fatura linki gönder"}
            </button>
          </div>

          <div className="space-y-3 border-t border-slate-700 pt-4">
            <div className="text-xs font-semibold text-slate-300">
              Fatura dosyası yükle (Trendyol seller-invoice-file)
            </div>
            <p className="text-xs text-slate-500">
              PDF, JPEG veya PNG; en fazla 10 MB. Micro ihracatta fatura no (16 karakter) ve tarih
              zorunludur — aşağıdaki kutuyu işaretleyin veya siparişte micro bayrağı açıksa otomatik
              uygulanır.
            </p>
            {!isMicroExport && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={fileMicroOverride}
                  onChange={(e) => setFileMicroOverride(e.target.checked)}
                />
                Micro ihracat paketi (fatura no + tarih bu formdaki alanlardan gider)
              </label>
            )}
            <input
              type="file"
              accept=".pdf,image/jpeg,image/png,.jpg,.jpeg,.png"
              disabled={fileLoading}
              className="block w-full text-xs text-slate-300 file:mr-2 file:rounded file:border file:border-slate-600 file:bg-slate-800 file:px-2 file:py-1"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void submitFileUpload(f);
              }}
            />
            {fileLoading ? <p className="text-xs text-slate-500">Yükleniyor…</p> : null}
          </div>

          <Modal open={confirmResend} onClose={() => setConfirmResend(false)} title="Yeniden gönder">
            <p className="text-sm text-slate-300">
              Bu paket için daha önce başarılı bir fatura gönderimi var. Trendyol&apos;a tekrar
              göndermek istiyor musunuz?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmResend(false)}>
                Vazgeç
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => void submit()}
              >
                Onayla ve gönder
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
