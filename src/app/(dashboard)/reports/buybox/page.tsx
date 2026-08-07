"use client";

import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type BuyboxRow = {
  productId: string;
  productName: string;
  barcode: string | null;
  ourPrice: number;
  buyboxOrder: number | null;
  buyboxPrice: number | null;
  hasMultipleSeller: boolean;
  secondBuyboxPrice: number | null;
  thirdBuyboxPrice: number | null;
  winningBuybox: boolean;
  gapToWin: number | null;
  checkedAt?: string | null;
};

function tl(n: number | null): string {
  if (n == null) return "—";
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function BuyboxContent() {
  const [rows, setRows] = useState<BuyboxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  async function loadSnapshot() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/trendyol/buybox-check");
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Veri alınamadı."));
      setRows(data.rows ?? []);
      setLastCheckedAt(data.lastCheckedAt ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veri alınamadı.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCheckNow() {
    setChecking(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/buybox-check", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Kontrol başarısız."));
      setMessage(
        `${data.checkedCount} ürün tarandı — ${data.winningCount} kazanıyor, ${data.losingCount} kaybediyor, ${data.noCompetitionCount} rakipsiz.`
      );
      await loadSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kontrol başarısız.");
    } finally {
      setChecking(false);
    }
  }

  const winning = rows.filter((r) => r.winningBuybox).length;
  const losing = rows.filter((r) => !r.winningBuybox && r.hasMultipleSeller).length;
  const noCompetition = rows.filter((r) => !r.hasMultipleSeller).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Buybox İzleme</h1>
          <p className="text-sm text-slate-400">
            Trendyol&apos;daki yayında olan ürünlerinizin buybox (öne çıkan satıcı) durumunu takip
            edin. Fiyat otomatik değiştirilmez — sadece izleme.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCheckNow}
          disabled={checking}
          className="btn-primary disabled:opacity-50"
        >
          {checking ? "Kontrol ediliyor…" : "Şimdi Kontrol Et"}
        </button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {lastCheckedAt && (
        <p className="text-xs text-slate-500">
          Son kontrol: {new Date(lastCheckedAt).toLocaleString("tr-TR")}
        </p>
      )}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="space-y-1">
              <div className="text-xs text-slate-400">Buybox Kazanılan</div>
              <div className="text-lg font-semibold text-emerald-300">{winning}</div>
            </Card>
            <Card className="space-y-1">
              <div className="text-xs text-slate-400">Buybox Kaybedilen</div>
              <div className="text-lg font-semibold text-red-400">{losing}</div>
            </Card>
            <Card className="space-y-1">
              <div className="text-xs text-slate-400">Rakipsiz</div>
              <div className="text-lg font-semibold text-slate-300">{noCompetition}</div>
            </Card>
          </div>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Ürünler ({rows.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-3">Ürün</th>
                    <th className="py-2 pr-3 text-right">Bizim Fiyat</th>
                    <th className="py-2 pr-3 text-right">Buybox Fiyatı</th>
                    <th className="py-2 pr-3 text-right">Sıramız</th>
                    <th className="py-2 pr-3 text-right">Satıcı Sayısı</th>
                    <th className="py-2 pr-3 text-right">Kazanmak İçin Fark</th>
                    <th className="py-2 pr-3">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-xs text-slate-500">
                        Henüz veri yok. &quot;Şimdi Kontrol Et&quot; ile ilk taramayı başlatın.
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.productId} className="border-b border-slate-800">
                      <td className="py-2 pr-3 text-slate-200">{r.productName}</td>
                      <td className="py-2 pr-3 text-right text-slate-200">{tl(r.ourPrice)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">{tl(r.buyboxPrice)}</td>
                      <td className="py-2 pr-3 text-right text-slate-300">
                        {r.buyboxOrder ?? "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-400">
                        {r.hasMultipleSeller ? "Birden fazla" : "Tek (siz)"}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-400">
                        {r.gapToWin != null ? tl(Math.abs(r.gapToWin)) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        {!r.hasMultipleSeller ? (
                          <span className="text-slate-500 text-xs">Rakipsiz</span>
                        ) : r.winningBuybox ? (
                          <span className="text-emerald-300 text-xs">✓ Kazanıyor</span>
                        ) : (
                          <span className="text-red-400 text-xs">✗ Kaybediyor</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

export default function BuyboxPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.publish">
      <BuyboxContent />
    </ClientPagePermissionGuard>
  );
}
