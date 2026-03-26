"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { PermissionGate } from "@/components/auth/PermissionGate";

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
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ayarlar</h1>
          <p className="text-sm text-slate-400">Yükleniyor...</p>
        </div>
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

      <PermissionGate permission="marketplace.integrations.manage">
        <div className="card flex flex-col gap-3 border-indigo-500/30 bg-indigo-950/20 sm:flex-row sm:items-center sm:justify-between">
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
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Trendyol ayarları →
          </Link>
        </div>
      </PermissionGate>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-800 bg-emerald-900/30 text-emerald-200"
              : "border-red-800 bg-red-900/30 text-red-200"
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Genel Ayarlar */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Genel Ayarlar
          </h2>

          <div>
            <label className="label">Şirket / Mağaza Adı</label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="input"
              placeholder="Örn: Maprithm Ticaret"
            />
          </div>

          <div>
            <label className="label">Varsayılan Para Birimi</label>
            <select
              value={defaultCurrency}
              onChange={(e) => setDefaultCurrency(e.target.value)}
              className="input"
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Varsayılan KDV Oranı (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={defaultVatRate}
                onChange={(e) => setDefaultVatRate(e.target.value)}
                className="input"
                placeholder="20"
              />
            </div>
            <div>
              <label className="label">Varsayılan Desi</label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={defaultDesi}
                onChange={(e) => setDefaultDesi(e.target.value)}
                className="input"
                placeholder="1"
              />
            </div>
          </div>
        </div>

        {/* Fiyat Önerisi Varsayılanları */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Fiyat Önerisi Varsayılanları
          </h2>

          <p className="text-xs text-slate-400">
            Bu değerler, ürün fiyat önerisi hesaplamalarında varsayılan olarak kullanılır.
          </p>

          <div>
            <label className="label">Varsayılan Komisyon Oranı (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={defaultCommissionRate}
              onChange={(e) => setDefaultCommissionRate(e.target.value)}
              className="input"
              placeholder="Örn: 20"
            />
          </div>

          <div>
            <label className="label">Varsayılan Kargo Maliyeti (₺)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={defaultCargoCost}
              onChange={(e) => setDefaultCargoCost(e.target.value)}
              className="input"
              placeholder="Örn: 30"
            />
          </div>

          <div>
            <label className="label">Varsayılan Hedef Kâr Oranı (%)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={defaultTargetProfitRate}
              onChange={(e) => setDefaultTargetProfitRate(e.target.value)}
              className="input"
              placeholder="Örn: 30"
            />
          </div>
        </div>

        {/* Export Fallback Değerleri */}
        <div className="card space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Export Fallback Değerleri
          </h2>

          <p className="text-xs text-slate-400">
            Trendyol ve diğer pazaryeri exportlarında, ürünlerde bu alanlar boşsa aşağıdaki değerler kullanılır.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Fallback Marka</label>
              <input
                type="text"
                value={fallbackBrand}
                onChange={(e) => setFallbackBrand(e.target.value)}
                className="input"
                placeholder="Örn: Maprithm"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ürünün markası boşsa bu değer kullanılır.
              </p>
            </div>
            <div>
              <label className="label">Fallback Kategori</label>
              <input
                type="text"
                value={fallbackCategory}
                onChange={(e) => setFallbackCategory(e.target.value)}
                className="input"
                placeholder="Örn: Genel"
              />
              <p className="text-xs text-slate-500 mt-1">
                Ürünün kategorisi boşsa bu değer kullanılır.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary px-6"
        >
          {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
        </button>
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
