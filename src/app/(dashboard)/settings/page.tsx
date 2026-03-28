"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type SettingsData = {
  companyName: string;
  defaultCurrency: string;
  defaultVatRate: number;
  defaultCommissionRate: number | null;
  defaultCargoCost: number | null;
  defaultTargetProfitRate: number | null;
  defaultDesi: number;
  fallbackBrand: string;
  fallbackCategory: string;
};

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "Türk Lirası (₺)" },
  { value: "USD", label: "Amerikan Doları ($)" },
  { value: "EUR", label: "Euro (€)" }
];

function SettingsPageContent() {
  const [activeTab, setActiveTab] = useState<"general" | "pricing" | "export">(
    "general"
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("TRY");
  const [defaultVatRate, setDefaultVatRate] = useState("20");
  const [defaultCommissionRate, setDefaultCommissionRate] = useState("");
  const [defaultCargoCost, setDefaultCargoCost] = useState("");
  const [defaultTargetProfitRate, setDefaultTargetProfitRate] = useState("");
  const [defaultDesi, setDefaultDesi] = useState("1");
  const [fallbackBrand, setFallbackBrand] = useState("");
  const [fallbackCategory, setFallbackCategory] = useState("");

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();

        if (data.settings) {
          setCompanyName(data.settings.companyName || "");
          setDefaultCurrency(data.settings.defaultCurrency || "TRY");
          setDefaultVatRate(String(data.settings.defaultVatRate ?? 20));
          setDefaultCommissionRate(
            data.settings.defaultCommissionRate != null
              ? String(data.settings.defaultCommissionRate)
              : ""
          );
          setDefaultCargoCost(
            data.settings.defaultCargoCost != null
              ? String(data.settings.defaultCargoCost)
              : ""
          );
          setDefaultTargetProfitRate(
            data.settings.defaultTargetProfitRate != null
              ? String(data.settings.defaultTargetProfitRate)
              : ""
          );
          setDefaultDesi(String(data.settings.defaultDesi ?? 1));
          setFallbackBrand(data.settings.fallbackBrand || "");
          setFallbackCategory(data.settings.fallbackCategory || "");
        }
      } catch (err) {
        console.error("Load settings error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName || null,
          defaultCurrency: defaultCurrency || "TRY",
          defaultVatRate: parseFloat(defaultVatRate) || 20,
          defaultCommissionRate: defaultCommissionRate
            ? parseFloat(defaultCommissionRate)
            : null,
          defaultCargoCost: defaultCargoCost
            ? parseFloat(defaultCargoCost)
            : null,
          defaultTargetProfitRate: defaultTargetProfitRate
            ? parseFloat(defaultTargetProfitRate)
            : null,
          defaultDesi: parseFloat(defaultDesi) || 1,
          fallbackBrand: fallbackBrand || null,
          fallbackCategory: fallbackCategory || null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Kaydetme başarısız.");
      }

      setMessage({
        type: "success",
        text: "Ayarlar başarıyla kaydedildi!"
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Kaydetme sırasında hata oluştu."
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>
        <p className="text-sm text-slate-400">
          Varsayılan ticari ayarlarınızı ve export tercihlerinizi yönetin.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`btn-secondary ${activeTab === "general" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("general")}>
          Genel
        </button>
        <button className={`btn-secondary ${activeTab === "pricing" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("pricing")}>
          Fiyatlandırma
        </button>
        <button className={`btn-secondary ${activeTab === "export" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("export")}>
          Export
        </button>
      </div>

      <PermissionGate permission="marketplace.integrations.manage">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Trendyol Partner API
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              API anahtarlarınızı şifreli saklayın ve bağlantıyı test edin.
            </p>
          </div>
          <Link
            href="/settings/trendyol"
            className="btn-primary"
          >
            Trendyol ayarları →
          </Link>
        </Card>
      </PermissionGate>

      {message && (
        <Alert variant={message.type === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Genel Ayarlar */}
        {(activeTab === "general" || activeTab === "export") && (
          <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Genel Ayarlar
          </h2>

          <div>
            <label className="label">Şirket / Mağaza Adı</label>
            <Input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Örn: Maprithm Ticaret"
            />
          </div>

          <div>
            <label className="label">Varsayılan Para Birimi</label>
            <Select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Varsayılan KDV Oranı (%)</label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={defaultVatRate}
                onChange={(e) => setDefaultVatRate(e.target.value)}
                placeholder="20"
              />
            </div>
            <div>
              <label className="label">Varsayılan Desi</label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={defaultDesi}
                onChange={(e) => setDefaultDesi(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>
          </Card>
        )}

        {/* Fiyat Önerisi Varsayılanları */}
        {(activeTab === "pricing" || activeTab === "general") && (
          <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Fiyat Önerisi Varsayılanları
          </h2>

          <p className="text-xs text-slate-400">
            Bu değerler, ürün fiyat önerisi hesaplamalarında varsayılan olarak kullanılır.
          </p>

          <div>
            <label className="label">Varsayılan Komisyon Oranı (%)</label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={defaultCommissionRate}
              onChange={(e) => setDefaultCommissionRate(e.target.value)}
              placeholder="Örn: 20"
            />
          </div>

          <div>
            <label className="label">Varsayılan Kargo Maliyeti (₺)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={defaultCargoCost}
              onChange={(e) => setDefaultCargoCost(e.target.value)}
              placeholder="Örn: 30"
            />
          </div>

          <div>
            <label className="label">Varsayılan Hedef Kâr Oranı (%)</label>
            <Input
              type="number"
              min="0"
              step="1"
              value={defaultTargetProfitRate}
              onChange={(e) => setDefaultTargetProfitRate(e.target.value)}
              placeholder="Örn: 30"
            />
          </div>
          </Card>
        )}

        {/* Export Fallback Değerleri */}
        {activeTab === "export" && (
          <Card className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Export Fallback Değerleri
          </h2>

          <p className="text-xs text-slate-400">
            Trendyol ve diğer pazaryeri exportlarında, ürünlerde bu alanlar boşsa aşağıdaki değerler kullanılır.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fallback Marka</label>
              <Input
                type="text"
                value={fallbackBrand}
                onChange={(e) => setFallbackBrand(e.target.value)}
                placeholder="Örn: Maprithm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ürünün markası boşsa bu değer kullanılır.
              </p>
            </div>
            <div>
              <label className="label">Fallback Kategori</label>
              <Input
                type="text"
                value={fallbackCategory}
                onChange={(e) => setFallbackCategory(e.target.value)}
                placeholder="Örn: Genel"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ürünün kategorisi boşsa bu değer kullanılır.
              </p>
            </div>
          </div>
          </Card>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ClientPagePermissionGuard permission="store.settings.manage">
      <SettingsPageContent />
    </ClientPagePermissionGuard>
  );
}
