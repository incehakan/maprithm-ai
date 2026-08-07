"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type IssueRow = Record<string, unknown>;

function pickNumber(row: IssueRow): string {
  const v =
    row.number ??
    row.issueNumber ??
    row.id ??
    row.issueId ??
    row.Number ??
    "";
  return String(v);
}

function pickTitle(row: IssueRow): string {
  const v =
    row.subject ??
    row.title ??
    row.question ??
    row.content ??
    row.message ??
    row.Description ??
    "";
  const s = String(v).trim();
  return s || "—";
}

function pickStatus(row: IssueRow): string {
  return String(row.status ?? row.Status ?? row.state ?? "—");
}

function extractIssues(data: unknown): IssueRow[] {
  if (Array.isArray(data)) return data as IssueRow[];
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    if (Array.isArray(r.items)) return r.items as IssueRow[];
    if (Array.isArray(r.data)) return r.data as IssueRow[];
    if (Array.isArray(r.content)) return r.content as IssueRow[];
    if (Array.isArray(r.issues)) return r.issues as IssueRow[];
  }
  return [];
}

function extractCount(data: unknown): number | null {
  if (typeof data === "number" && Number.isFinite(data)) return data;
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    for (const k of ["count", "total", "totalCount", "waitingCount", "pendingCount"]) {
      const v = r[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

function HepsiburadaQuestionsPageContent() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authUnavailable, setAuthUnavailable] = useState(false);
  const [noConnection, setNoConnection] = useState(false);
  const [rows, setRows] = useState<IssueRow[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [answerOpen, setAnswerOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [answerText, setAnswerText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAuthUnavailable(false);
    setNoConnection(false);
    try {
      const [listRes, countRes] = await Promise.all([
        fetch("/api/integrations/hepsiburada/ask-to-seller"),
        fetch("/api/integrations/hepsiburada/ask-to-seller?mode=count"),
      ]);
      const [listJson, countJson] = await Promise.all([
        listRes.json().catch(() => null),
        countRes.json().catch(() => null),
      ]);

      if (listRes.status === 401 || listJson?.authUnavailable) {
        const errText = String(listJson?.error ?? "");
        if (/bağlantı|connection|NO_ACTIVE|Aktif Hepsiburada/i.test(errText)) {
          setNoConnection(true);
        } else {
          setAuthUnavailable(true);
        }
        setRows([]);
        setCount(null);
        return;
      }

      if (!listRes.ok) {
        throw new Error(
          extractApiErrorMessage(listJson, "Sorular alınamadı.")
        );
      }

      setRows(extractIssues(listJson?.data));
      if (countRes.ok) {
        setCount(extractCount(countJson?.data));
      } else {
        setCount(null);
      }
    } catch (e) {
      const text = e instanceof Error ? e.message : "Hata";
      if (/bağlantı|connection|Aktif Hepsiburada/i.test(text)) {
        setNoConnection(true);
      } else {
        setError(text);
      }
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (number: string) => {
    setSelected(number);
    setDetail(null);
    setDetailLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/ask-to-seller/${encodeURIComponent(number)}`
      );
      const data = await res.json().catch(() => null);
      if (res.status === 401 || data?.authUnavailable) {
        setAuthUnavailable(true);
        return;
      }
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Detay alınamadı."));
      }
      setDetail(data?.data ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Detay hatası");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  async function submitAnswer() {
    if (!selected || !answerText.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/ask-to-seller/${encodeURIComponent(selected)}/answer`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answerText: answerText.trim() }),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Cevap gönderilemedi."));
      }
      setAnswerOpen(false);
      setAnswerText("");
      setMsg("Cevap gönderildi.");
      await openDetail(selected);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  async function submitReject() {
    if (!selected) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/ask-to-seller/${encodeURIComponent(selected)}/reject`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Reddedilemedi."));
      }
      setRejectOpen(false);
      setMsg("Soru reddedildi.");
      await openDetail(selected);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  const actionsDisabled = authUnavailable || noConnection || busy;

  const countLabel = useMemo(() => {
    if (count == null) return null;
    return `${count} bekleyen soru`;
  }, [count]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hepsiburada Sorular
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Satıcıya Sor (Ask to Seller) — müşteri sorularını listele, cevapla veya reddet.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {countLabel ? (
            <span className="rounded bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-200 ring-1 ring-amber-500/30">
              {countLabel}
            </span>
          ) : null}
          {authUnavailable ? (
            <span className="rounded bg-slate-500/20 px-2 py-1 text-xs text-slate-300 ring-1 ring-slate-500/40">
              Yakında — auth doğrulanmadı
            </span>
          ) : null}
          <Link href="/settings/hepsiburada" className="btn-secondary text-sm">
            Bağlantı ayarları
          </Link>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={loading}
            onClick={() => void load()}
          >
            Yenile
          </button>
        </div>
      </div>

      {noConnection ? (
        <Alert variant="warning">
          Hepsiburada bağlantısı kayıtlı değil. Önce Ayarlar → Hepsiburada’dan
          SIT/test bilgilerini kaydedin.
        </Alert>
      ) : null}
      {authUnavailable ? (
        <Alert variant="warning">
          Ask-to-Seller API kimlik doğrulaması başarısız (401/403). Basic Auth
          bu serviste geçerli olmayabilir — aksiyonlar geçici olarak kapalı
          (Yakında).
        </Alert>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
      {msg ? <Alert>{msg}</Alert> : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">No</th>
                <th className="px-3 py-2">Konu</th>
                <th className="px-3 py-2">Durum</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-slate-400">
                    Yükleniyor…
                  </td>
                </tr>
              ) : authUnavailable || noConnection ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-slate-400">
                    Liste kullanılamıyor.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-slate-400">
                    Soru yok (veya yanıt şeması henüz tabloya map edilmedi — ham
                    detay sağ panelde).
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const number = pickNumber(row) || String(idx);
                  return (
                    <tr
                      key={number}
                      className={`cursor-pointer border-b border-slate-800/80 hover:bg-slate-900/50 ${
                        selected === number ? "bg-slate-900/70" : ""
                      }`}
                      onClick={() => void openDetail(number)}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{number}</td>
                      <td className="px-3 py-2">{pickTitle(row)}</td>
                      <td className="px-3 py-2 text-slate-400">{pickStatus(row)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-medium text-slate-200">Detay</h2>
          {!selected ? (
            <p className="text-sm text-slate-500">Soldan bir soru seçin.</p>
          ) : detailLoading ? (
            <p className="text-sm text-slate-400">Yükleniyor…</p>
          ) : (
            <>
              <pre className="max-h-72 overflow-auto rounded bg-slate-950/80 p-3 text-xs text-slate-300">
                {JSON.stringify(detail, null, 2) ?? "null"}
              </pre>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={actionsDisabled || !selected}
                  onClick={() => setAnswerOpen(true)}
                >
                  Cevapla
                </button>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  disabled={actionsDisabled || !selected}
                  onClick={() => setRejectOpen(true)}
                >
                  Reddet
                </button>
              </div>
            </>
          )}
        </Card>
      </div>

      <Modal
        open={answerOpen}
        onClose={() => setAnswerOpen(false)}
        title={`Cevapla — #${selected ?? ""}`}
      >
        <textarea
          className="input min-h-[120px] w-full text-sm"
          value={answerText}
          onChange={(e) => setAnswerText(e.target.value)}
          placeholder="Cevabınızı yazın…"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setAnswerOpen(false)}
          >
            İptal
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy || !answerText.trim()}
            onClick={() => void submitAnswer()}
          >
            Gönder
          </button>
        </div>
      </Modal>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reddet — #${selected ?? ""}`}
      >
        <p className="text-sm text-slate-300">
          Bu soruyu reddetmek istediğinize emin misiniz? İşlem Hepsiburada’ya
          gönderilir.
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary text-sm"
            onClick={() => setRejectOpen(false)}
          >
            Vazgeç
          </button>
          <button
            type="button"
            className="btn-primary text-sm"
            disabled={busy}
            onClick={() => void submitReject()}
          >
            Evet, reddet
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default function HepsiburadaQuestionsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <HepsiburadaQuestionsPageContent />
    </ClientPagePermissionGuard>
  );
}
