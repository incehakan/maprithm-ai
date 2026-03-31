"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Line = {
  id: string;
  kind: string;
  externalId: string;
  transactionDateMs: string | null;
  transactionType: string | null;
  orderNumber: string | null;
  paymentOrderId: string | null;
  barcode: string | null;
  debt: string | null;
  credit: string | null;
  sellerRevenue: string | null;
  commissionAmount: string | null;
  description: string | null;
  updatedAt: string;
};

type Run = {
  id: string;
  kind: string;
  supplierId: string;
  startDateMs: string;
  endDateMs: string;
  transactionType: string | null;
  transactionTypes: string | null;
  pageFetched: number;
  pageSize: number;
  httpStatus: number | null;
  success: boolean;
  errorMessage: string | null;
  totalPages: number | null;
  totalElements: number | null;
  createdAt: string;
};

function msDate(ms: string | null): string {
  if (!ms) return "—";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Date(n).toLocaleString("tr-TR");
  } catch {
    return "—";
  }
}

export function TrendyolFinanceClient({ canSync }: { canSync: boolean }) {
  const { data: session, status: sessionStatus } = useSession();
  const permissionKeys =
    (session?.permissionKeys as string[] | undefined) ?? [];

  const [kind, setKind] = useState<"settlements" | "otherfinancials" | "">(
    "settlements"
  );
  const [transactionType, setTransactionType] = useState("Sale");
  const [page, setPage] = useState(0);
  const [size, setSize] = useState<500 | 1000>(500);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [syncMsg, setSyncMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [lines, setLines] = useState<Line[]>([]);
  const [linesTotal, setLinesTotal] = useState(0);
  const [linesPage, setLinesPage] = useState(0);
  const [linesLoading, setLinesLoading] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);

  const loadLines = useCallback(async (lpage: number) => {
    setLinesLoading(true);
    try {
      const p = new URLSearchParams();
      if (kind) p.set("kind", kind);
      p.set("page", String(lpage));
      p.set("pageSize", "25");
      const res = await fetch(`/api/integrations/trendyol/finance/lines?${p}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLines([]);
        setLinesTotal(0);
        return;
      }
      setLines(Array.isArray(data.lines) ? data.lines : []);
      setLinesTotal(typeof data.total === "number" ? data.total : 0);
      setLinesPage(typeof data.page === "number" ? data.page : lpage);
    } finally {
      setLinesLoading(false);
    }
  }, [kind]);

  const loadRuns = useCallback(async () => {
    const res = await fetch("/api/integrations/trendyol/finance/runs");
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.runs)) setRuns(data.runs);
  }, []);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    loadLines(0);
    loadRuns();
  }, [sessionStatus, loadLines, loadRuns]);

  async function handleSync(e: React.FormEvent) {
    e.preventDefault();
    if (!canSync) return;
    setSyncMsg(null);
    const start = startInput.trim()
      ? Date.parse(startInput)
      : Date.now() - 7 * 24 * 60 * 60 * 1000;
    const end = endInput.trim() ? Date.parse(endInput) : Date.now();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      setSyncMsg({
        type: "err",
        text: "Başlangıç ve bitiş tarihleri geçerli olmalı."
      });
      return;
    }
    if (!kind) {
      setSyncMsg({ type: "err", text: "Kayıt türü seçin." });
      return;
    }
    const tx = transactionType.trim();
    if (!tx) {
      setSyncMsg({ type: "err", text: "transactionType zorunlu (örn. Sale, PaymentOrder)." });
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch("/api/integrations/trendyol/finance/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          startDateMs: start,
          endDateMs: end,
          transactionType: tx,
          page,
          size
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSyncMsg({
          type: "err",
          text: typeof data.error === "string" ? data.error : "Senkron başarısız."
        });
        return;
      }
      setSyncMsg({
        type: "ok",
        text:
          typeof data.message === "string"
            ? data.message
            : "Senkron tamamlandı."
      });
      await loadLines(0);
      await loadRuns();
    } catch {
      setSyncMsg({ type: "err", text: "İstek başarısız." });
    } finally {
      setSyncing(false);
    }
  }

  if (sessionStatus === "loading") {
    return <p className="text-sm text-slate-400">Oturum yükleniyor…</p>;
  }

  const canSeeLines = permissionKeys.includes("trendyol.finance.view");

  return (
    <div className="space-y-8">
      {canSync && (
        <form onSubmit={handleSync} className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">Tek sayfa çek</h2>
          <p className="text-xs text-slate-400">
            Trendyol API tarih aralığı en fazla 15 gün. settlement türleri (ör.{" "}
            <code className="text-slate-300">Sale</code>, <code className="text-slate-300">Return</code>
            ); diğer finans için <code className="text-slate-300">PaymentOrder</code>,{" "}
            <code className="text-slate-300">WireTransfer</code> vb.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-slate-400">
              Tür
              <select
                className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={kind}
                onChange={(e) =>
                  setKind(
                    e.target.value === "otherfinancials"
                      ? "otherfinancials"
                      : e.target.value === "settlements"
                        ? "settlements"
                        : ""
                  )
                }
              >
                <option value="settlements">settlements</option>
                <option value="otherfinancials">otherfinancials</option>
              </select>
            </label>
            <label className="text-xs text-slate-400">
              transactionType
              <input
                className="ml-2 w-40 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={transactionType}
                onChange={(e) => setTransactionType(e.target.value)}
                placeholder="Sale"
              />
            </label>
            <label className="text-xs text-slate-400">
              API sayfa
              <input
                type="number"
                min={0}
                className="ml-2 w-16 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={page}
                onChange={(e) => setPage(Math.max(0, Number(e.target.value) || 0))}
              />
            </label>
            <label className="text-xs text-slate-400">
              size
              <select
                className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={size}
                onChange={(e) =>
                  setSize(Number(e.target.value) === 1000 ? 1000 : 500)
                }
              >
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-slate-400">
              Başlangıç (yerel)
              <input
                type="datetime-local"
                className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400">
              Bitiş (yerel)
              <input
                type="datetime-local"
                className="ml-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
              />
            </label>
          </div>
          <div>
            <button
              type="submit"
              disabled={syncing}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {syncing ? "Çekiliyor…" : "Trendyol’dan çek ve kaydet"}
            </button>
          </div>
          {syncMsg && (
            <p
              className={`text-sm ${syncMsg.type === "ok" ? "text-emerald-400" : "text-red-300"}`}
            >
              {syncMsg.text}
            </p>
          )}
        </form>
      )}

      {!canSync && (
        <p className="text-sm text-amber-400/90">
          Senkron için <code className="text-slate-300">trendyol.finance.sync</code> izni gerekir.
        </p>
      )}

      {canSeeLines && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-100">Kayıtlı satırlar</h2>
            <button
              type="button"
              onClick={() => loadLines(linesPage)}
              disabled={linesLoading}
              className="text-xs text-indigo-400 hover:underline disabled:opacity-50"
            >
              Yenile
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead className="border-b border-slate-700 bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="px-2 py-2">Tarih</th>
                  <th className="px-2 py-2">Tür</th>
                  <th className="px-2 py-2">Sipariş</th>
                  <th className="px-2 py-2">Barkod</th>
                  <th className="px-2 py-2">Borç</th>
                  <th className="px-2 py-2">Alacak</th>
                </tr>
              </thead>
              <tbody>
                {linesLoading ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-slate-500">
                      Yükleniyor…
                    </td>
                  </tr>
                ) : lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-slate-500">
                      Henüz satır yok. Senkron çalıştırın veya filtreleri kaldırın.
                    </td>
                  </tr>
                ) : (
                  lines.map((r) => (
                    <tr key={r.id} className="border-b border-slate-800/80">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {msDate(r.transactionDateMs)}
                      </td>
                      <td className="px-2 py-1.5">{r.transactionType ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.orderNumber ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.barcode ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.debt ?? "—"}</td>
                      <td className="px-2 py-1.5">{r.credit ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>
              Toplam {linesTotal} — sayfa {linesPage + 1} /{" "}
              {Math.max(1, Math.ceil(linesTotal / 25))}
            </span>
            <button
              type="button"
              disabled={linesPage <= 0 || linesLoading}
              className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
              onClick={() => loadLines(linesPage - 1)}
            >
              Önceki
            </button>
            <button
              type="button"
              disabled={
                linesLoading || (linesPage + 1) * 25 >= linesTotal
              }
              className="rounded border border-slate-600 px-2 py-0.5 hover:bg-slate-800 disabled:opacity-40"
              onClick={() => loadLines(linesPage + 1)}
            >
              Sonraki
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-100">Son senkronlar</h2>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-400">
          {runs.length === 0 ? (
            <li>Henüz senkron kaydı yok.</li>
          ) : (
            runs.map((r) => (
              <li key={r.id} className="rounded border border-slate-800/80 px-2 py-1">
                <span className={r.success ? "text-emerald-400" : "text-red-300"}>
                  {r.success ? "OK" : "Hata"}
                </span>{" "}
                {r.kind} pg{r.pageFetched} —{" "}
                {new Date(r.createdAt).toLocaleString("tr-TR")}
                {r.errorMessage ? ` — ${r.errorMessage.slice(0, 120)}` : ""}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
