"use client";

import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type ReportRow = {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  productName: string | null;
  barcode: string | null;
  quantity: number;
  matched: boolean;
  revenue: number;
  commission: number;
  commissionSource: string;
  cargoCost: number;
  productCost: number;
  hasCost: boolean;
  netProfit: number | null;
  profitMarginPct: number | null;
};

type Summary = {
  lineCount: number;
  matchedCount: number;
  totalRevenue: number;
  totalCommission: number;
  totalCargoCost: number;
  totalProductCost: number;
  totalNetProfit: number;
  unknownCostCount: number;
};

const DAY_OPTIONS = [
  { value: "7", label: "Son 7 gün" },
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 90 gün" }
];

function tl(n: number): string {
  return `₺${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ReportContent() {
  const [days, setDays] = useState("30");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/reports/order-profitability?days=${days}`);
        const data = await res.json();
        if (!res.ok) throw new Error(extractApiErrorMessage(data, "Rapor alınamadı."));
        if (cancelled) return;
        setRows(data.rows ?? []);
        setSummary(data.summary ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Rapor alınamadı.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Sipariş Kârlılık Raporu</h1>
          <p className="text-sm text-slate-400">
            Trendyol siparişlerini ürün maliyetiyle eşleştirip gerçek kâr/zarar hesaplar.
          </p>
        </div>
        <div className="w-40">
          <Select value={days} onChange={(e) => setDays(e.target.value)}>
            {DAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          {summary && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="space-y-1">
                <div className="text-xs text-slate-400">Ciro</div>
                <div className="text-lg font-semibold text-slate-100">
                  {tl(summary.totalRevenue)}
                </div>
              </Card>
              <Card className="space-y-1">
                <div className="text-xs text-slate-400">Komisyon</div>
                <div className="text-lg font-semibold text-amber-300">
                  {tl(summary.totalCommission)}
                </div>
              </Card>
              <Card className="space-y-1">
                <div className="text-xs text-slate-400">Kargo</div>
                <div className="text-lg font-semibold text-amber-300">
                  {tl(summary.totalCargoCost)}
                </div>
              </Card>
              <Card className="space-y-1">
                <div className="text-xs text-slate-400">Ürün Maliyeti</div>
                <div className="text-lg font-semibold text-amber-300">
                  {tl(summary.totalProductCost)}
                </div>
              </Card>
              <Card className="space-y-1">
                <div className="text-xs text-slate-400">Net Kâr</div>
                <div
                  className={`text-lg font-semibold ${
                    summary.totalNetProfit >= 0 ? "text-emerald-300" : "text-red-400"
                  }`}
                >
                  {tl(summary.totalNetProfit)}
                </div>
              </Card>
            </div>
          )}

          {summary && summary.unknownCostCount > 0 && (
            <Alert variant="info">
              {summary.unknownCostCount} satırda maliyet fiyatı bilinmiyor (ürün eşleşmedi veya
              costPrice boş) — bu satırlar Net Kâr toplamına dahil edilmedi. Rapor eksik olabilir.
            </Alert>
          )}

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Sipariş Satırları ({rows.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                    <th className="py-2 pr-3">Sipariş No</th>
                    <th className="py-2 pr-3">Tarih</th>
                    <th className="py-2 pr-3">Ürün</th>
                    <th className="py-2 pr-3 text-right">Adet</th>
                    <th className="py-2 pr-3 text-right">Ciro</th>
                    <th className="py-2 pr-3 text-right">Komisyon</th>
                    <th className="py-2 pr-3 text-right">Kargo</th>
                    <th className="py-2 pr-3 text-right">Maliyet</th>
                    <th className="py-2 pr-3 text-right">Net Kâr</th>
                    <th className="py-2 pr-3 text-right">Marj %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-4 text-center text-xs text-slate-500">
                        Seçili aralıkta sipariş satırı bulunamadı.
                      </td>
                    </tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={`${r.orderId}-${i}`} className="border-b border-slate-800">
                      <td className="py-2 pr-3 text-slate-200">{r.orderNumber}</td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">
                        {new Date(r.orderDate).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="py-2 pr-3 text-slate-200">
                        {r.productName ?? "—"}
                        {!r.matched && (
                          <span className="ml-1 text-[10px] text-amber-400">(eşleşmedi)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-300">{r.quantity}</td>
                      <td className="py-2 pr-3 text-right text-slate-200">{tl(r.revenue)}</td>
                      <td className="py-2 pr-3 text-right text-slate-400">
                        {tl(r.commission)}
                        <span className="ml-1 text-[10px]">
                          {r.commissionSource === "marketplace_actual" ? "(gerçek)" : "(tahmini)"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-400">{tl(r.cargoCost)}</td>
                      <td className="py-2 pr-3 text-right text-slate-400">
                        {r.hasCost ? tl(r.productCost) : "—"}
                      </td>
                      <td
                        className={`py-2 pr-3 text-right font-medium ${
                          r.netProfit == null
                            ? "text-slate-500"
                            : r.netProfit >= 0
                              ? "text-emerald-300"
                              : "text-red-400"
                        }`}
                      >
                        {r.netProfit != null ? tl(r.netProfit) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-slate-400">
                        {r.profitMarginPct != null ? `%${r.profitMarginPct}` : "—"}
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

export default function OrderProfitabilityPage() {
  return (
    <ClientPagePermissionGuard permission="orders.view">
      <ReportContent />
    </ClientPagePermissionGuard>
  );
}
