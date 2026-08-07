"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

type Tab = "tl" | "percent" | "xy";

function splitCsv(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function HepsiburadaCampaignsPageContent() {
  const [tab, setTab] = useState<Tab>("tl");
  const [discountsRaw, setDiscountsRaw] = useState<unknown>(null);
  const [metaRaw, setMetaRaw] = useState<{
    categories?: unknown;
    budgets?: unknown;
    limits?: unknown;
  }>({});
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [detailRaw, setDetailRaw] = useState<unknown>(null);

  // ortak form alanları
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [conditionCategories, setConditionCategories] = useState("");
  const [conditionSkus, setConditionSkus] = useState("");
  const [oneTimeUsage, setOneTimeUsage] = useState(false);

  // TL
  const [budget, setBudget] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [conditionAmount, setConditionAmount] = useState("");

  // Percent
  const [discountPercentage, setDiscountPercentage] = useState("");
  const [maxDiscountAmount, setMaxDiscountAmount] = useState("");
  const [maxCartCount, setMaxCartCount] = useState("");

  // XY
  const [conditionProductCount, setConditionProductCount] = useState("");
  const [mustPayProductCount, setMustPayProductCount] = useState("");
  const [iterationCount, setIterationCount] = useState("");

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const [dRes, cRes, bRes, lRes] = await Promise.all([
        fetch("/api/integrations/hepsiburada/campaigns/discounts"),
        fetch("/api/integrations/hepsiburada/campaigns/categories"),
        fetch("/api/integrations/hepsiburada/campaigns/budgets"),
        fetch("/api/integrations/hepsiburada/campaigns/limits"),
      ]);
      const [dJson, cJson, bJson, lJson] = await Promise.all([
        dRes.json().catch(() => null),
        cRes.json().catch(() => null),
        bRes.json().catch(() => null),
        lRes.json().catch(() => null),
      ]);
      if (!dRes.ok) {
        throw new Error(
          extractApiErrorMessage(dJson, "Kampanya listesi alınamadı.")
        );
      }
      setDiscountsRaw(dJson?.data ?? null);
      console.info("[HB campaigns] discounts", dJson?.data);
      setMetaRaw({
        categories: cRes.ok ? cJson?.data : { error: cJson?.error },
        budgets: bRes.ok ? bJson?.data : { error: bJson?.error },
        limits: lRes.ok ? lJson?.data : { error: lJson?.error },
      });
      console.info("[HB campaigns] categories/budgets/limits", {
        categories: cJson?.data,
        budgets: bJson?.data,
        limits: lJson?.data,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata");
      setDiscountsRaw(null);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  async function loadDetail() {
    if (!detailId.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/campaigns/discounts/${encodeURIComponent(detailId.trim())}`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Detay alınamadı."));
      }
      setDetailRaw(data?.data ?? null);
      console.info("[HB campaigns] discount detail", data?.data);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
      setDetailRaw(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate() {
    setBusy(true);
    setMsg(null);
    try {
      const shared = {
        name: name.trim(),
        startDate,
        endDate,
        conditionCategories: splitCsv(conditionCategories),
        conditionSkus: splitCsv(conditionSkus),
        oneTimeUsage,
      };

      let path = "";
      let body: Record<string, unknown> = {};

      if (tab === "tl") {
        path = "/api/integrations/hepsiburada/campaigns/tl-discount";
        body = {
          ...shared,
          budget: Number(budget),
          discountAmount: Number(discountAmount),
          conditionAmount: Number(conditionAmount),
        };
      } else if (tab === "percent") {
        path = "/api/integrations/hepsiburada/campaigns/percent-discount";
        body = {
          ...shared,
          discountPercentage: Number(discountPercentage),
          conditionAmount: Number(conditionAmount),
          maxDiscountAmount: Number(maxDiscountAmount),
          maxCartCount: Number(maxCartCount),
        };
      } else {
        path = "/api/integrations/hepsiburada/campaigns/xy-discount";
        body = {
          ...shared,
          conditionProductCount: Number(conditionProductCount),
          mustPayProductCount: Number(mustPayProductCount),
          IterationCount: Number(iterationCount),
          maxCartCount: Number(maxCartCount),
        };
      }

      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Oluşturma başarısız."));
      }
      setMsg("Kampanya oluşturma isteği gönderildi. Yanıt aşağıda / konsolda.");
      console.info("[HB campaigns] create response", data?.data);
      await loadList();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Hata");
    } finally {
      setBusy(false);
    }
  }

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      className={
        tab === id
          ? "btn-primary text-sm"
          : "btn-secondary text-sm"
      }
      onClick={() => setTab(id)}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Hepsiburada Kampanyalar
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Self-Campaign (Diskonto). Auth: Basic (sayfada doğrulanmadı — 401
            olursa ilk şüphe). Saat seçimi yok: HB tarihi gün bazında işler.
          </p>
        </div>
        <Link href="/settings/hepsiburada" className="btn-secondary text-sm">
          Bağlantı ayarları
        </Link>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}
      {msg ? <Alert>{msg}</Alert> : null}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-slate-200">Kampanya listesi (ham JSON)</h2>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={loadingList}
            onClick={() => void loadList()}
          >
            Yenile
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Response şeması belgelenmedi — tablo yok; alan adları netleşene kadar ham JSON.
        </p>
        <pre className="max-h-64 overflow-auto rounded bg-slate-950/80 p-3 text-xs text-slate-300">
          {loadingList
            ? "Yükleniyor…"
            : JSON.stringify(discountsRaw, null, 2) ?? "null"}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary text-xs opacity-60"
            disabled
            title="cancel-discount body şeması doğrulanmadı"
          >
            İptal (Yakında)
          </button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium text-slate-200">
          Bütçe / limit / kampanya kategorileri (ham)
        </h2>
        <p className="text-xs text-slate-500">
          Katalog CategoryPicker kullanılmıyor — kampanya kategori kaynağı farklı
          olabilir. ID&apos;leri formda virgülle yazın; aşağıda 1.4 yanıtını inceleyin.
        </p>
        <pre className="max-h-48 overflow-auto rounded bg-slate-950/80 p-3 text-xs text-slate-300">
          {JSON.stringify(metaRaw, null, 2)}
        </pre>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs">
            Kampanya detayı (campaignId)
            <input
              className="input mt-0.5 min-w-[200px]"
              value={detailId}
              onChange={(e) => setDetailId(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn-secondary text-sm"
            disabled={busy || !detailId.trim()}
            onClick={() => void loadDetail()}
          >
            Detay getir
          </button>
        </div>
        {detailRaw != null ? (
          <pre className="max-h-40 overflow-auto rounded bg-slate-950/80 p-3 text-xs text-slate-300">
            {JSON.stringify(detailRaw, null, 2)}
          </pre>
        ) : null}
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-medium text-slate-200">Yeni Kampanya</h2>
        <div className="flex flex-wrap gap-2">
          {tabBtn("tl", "TL indirimi")}
          {tabBtn("percent", "Yüzde indirimi")}
          {tabBtn("xy", "X Al Y Öde")}
        </div>

        <p className="text-xs text-amber-200/90">
          Tarih alanları: yalnızca gün seçin. HB startDate bugünse ~1 saat sonra,
          ileri tarihte 00:00; endDate gün sonu 23:59 işler (gönderilen saat yok sayılır).
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs">
            Ad (Description)
            <input className="input mt-0.5 w-full" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-xs sm:mt-6">
            <input
              type="checkbox"
              checked={oneTimeUsage}
              onChange={(e) => setOneTimeUsage(e.target.checked)}
            />
            Tek kullanımlık (oneTimeUsage)
          </label>
          <label className="text-xs">
            Başlangıç (startDate)
            <input
              type="date"
              className="input mt-0.5 w-full"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Bitiş (endDate)
            <input
              type="date"
              className="input mt-0.5 w-full"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            Kategori ID&apos;leri (virgülle — conditionCategories)
            <input
              className="input mt-0.5 w-full"
              value={conditionCategories}
              onChange={(e) => setConditionCategories(e.target.value)}
              placeholder="örn. 12345, 67890"
            />
          </label>
          <label className="text-xs sm:col-span-2">
            SKU&apos;lar (virgülle — conditionSkus)
            <input
              className="input mt-0.5 w-full"
              value={conditionSkus}
              onChange={(e) => setConditionSkus(e.target.value)}
            />
          </label>
        </div>

        {tab === "tl" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs">
              Bütçe
              <input className="input mt-0.5 w-full" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label className="text-xs">
              İndirim tutarı
              <input
                className="input mt-0.5 w-full"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Sepet alt limiti
              <input
                className="input mt-0.5 w-full"
                value={conditionAmount}
                onChange={(e) => setConditionAmount(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {tab === "percent" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              İndirim %
              <input
                className="input mt-0.5 w-full"
                value={discountPercentage}
                onChange={(e) => setDiscountPercentage(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Sepet alt limiti
              <input
                className="input mt-0.5 w-full"
                value={conditionAmount}
                onChange={(e) => setConditionAmount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Max indirim tutarı
              <input
                className="input mt-0.5 w-full"
                value={maxDiscountAmount}
                onChange={(e) => setMaxDiscountAmount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Max sepet sayısı
              <input
                className="input mt-0.5 w-full"
                value={maxCartCount}
                onChange={(e) => setMaxCartCount(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        {tab === "xy" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              X (alınacak adet)
              <input
                className="input mt-0.5 w-full"
                value={conditionProductCount}
                onChange={(e) => setConditionProductCount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Y (ödenecek adet)
              <input
                className="input mt-0.5 w-full"
                value={mustPayProductCount}
                onChange={(e) => setMustPayProductCount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              IterationCount (tekrar)
              <input
                className="input mt-0.5 w-full"
                value={iterationCount}
                onChange={(e) => setIterationCount(e.target.value)}
              />
            </label>
            <label className="text-xs">
              Max sepet sayısı
              <input
                className="input mt-0.5 w-full"
                value={maxCartCount}
                onChange={(e) => setMaxCartCount(e.target.value)}
              />
            </label>
          </div>
        ) : null}

        <button
          type="button"
          className="btn-primary text-sm"
          disabled={busy || !name.trim() || !startDate || !endDate}
          onClick={() => void submitCreate()}
        >
          Kampanya oluştur
        </button>
      </Card>
    </div>
  );
}

export default function HepsiburadaCampaignsPage() {
  return (
    <ClientPagePermissionGuard permission="marketplace.integrations.manage">
      <HepsiburadaCampaignsPageContent />
    </ClientPagePermissionGuard>
  );
}
