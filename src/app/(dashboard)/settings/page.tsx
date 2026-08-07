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
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

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
  xmlBarcodePrefix: string;
};

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "Türk Lirası (₺)" },
  { value: "USD", label: "Amerikan Doları ($)" },
  { value: "EUR", label: "Euro (€)" }
];

// src/lib/featureFlags.ts -> FEATURE_FLAGS.PRICING_TIER_AUTO_APPLY ile aynı anahtar
const PRICING_TIER_AUTO_APPLY_KEY = "pricing_tier_auto_apply_enabled";

type PricingTier = {
  id: string;
  label: string;
  minCostPrice: number;
  maxCostPrice: number | null;
  commissionRate: number;
  cargoCost: number;
  targetProfitRate: number;
  isActive: boolean;
};

type PricingTierFormState = {
  label: string;
  minCostPrice: string;
  maxCostPrice: string;
  commissionRate: string;
  cargoCost: string;
  targetProfitRate: string;
};

const EMPTY_TIER_FORM: PricingTierFormState = {
  label: "",
  minCostPrice: "",
  maxCostPrice: "",
  commissionRate: "",
  cargoCost: "",
  targetProfitRate: ""
};

function SettingsPageContent() {
  const [activeTab, setActiveTab] = useState<"general" | "pricing" | "tiers">(
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
  const [xmlBarcodePrefix, setXmlBarcodePrefix] = useState("");

  // Kademeli fiyatlandırma (fiyat aralıkları)
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(true);
  const [tiersMessage, setTiersMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [newTierForm, setNewTierForm] = useState<PricingTierFormState>(EMPTY_TIER_FORM);
  const [addingTier, setAddingTier] = useState(false);
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [editTierForm, setEditTierForm] = useState<PricingTierFormState>(EMPTY_TIER_FORM);
  const [savingTierEdit, setSavingTierEdit] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [autoApplySaving, setAutoApplySaving] = useState(false);

  // Ürün/fiyat/stok bazlı yayın kısıtlama kuralı
  const [ruleMinStock, setRuleMinStock] = useState("");
  const [ruleMinPrice, setRuleMinPrice] = useState("");
  const [ruleMaxPrice, setRuleMaxPrice] = useState("");
  const [ruleActive, setRuleActive] = useState(false);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleSaving, setRuleSaving] = useState(false);

  // Buybox otomatik yeniden fiyatlandırma
  const [repriceActive, setRepriceActive] = useState(false);
  const [repriceStrategy, setRepriceStrategy] = useState("undercut_amount");
  const [repriceUndercutValue, setRepriceUndercutValue] = useState("1");
  const [repriceMinMarginPct, setRepriceMinMarginPct] = useState("");
  const [repriceLoading, setRepriceLoading] = useState(true);
  const [repriceSaving, setRepriceSaving] = useState(false);
  const [repriceRunning, setRepriceRunning] = useState(false);

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
          setXmlBarcodePrefix(data.settings.xmlBarcodePrefix || "");
        }
      } catch (err) {
        console.error("Load settings error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  useEffect(() => {
    async function loadTiers() {
      try {
        const res = await fetch("/api/settings/pricing-tiers");
        const data = await res.json();
        if (Array.isArray(data.tiers)) {
          setTiers(data.tiers);
        }
      } catch (err) {
        console.error("Load pricing tiers error:", err);
      } finally {
        setTiersLoading(false);
      }
    }

    async function loadFeatureFlags() {
      try {
        const res = await fetch("/api/settings/feature-flags");
        const data = await res.json();
        if (data?.flags && typeof data.flags[PRICING_TIER_AUTO_APPLY_KEY] === "boolean") {
          setAutoApplyEnabled(data.flags[PRICING_TIER_AUTO_APPLY_KEY]);
        }
      } catch (err) {
        console.error("Load feature flags error:", err);
      }
    }

    loadTiers();
    loadFeatureFlags();
  }, []);

  useEffect(() => {
    async function loadPublishRule() {
      try {
        const res = await fetch("/api/settings/publish-rules");
        const data = await res.json();
        if (data?.rule) {
          setRuleMinStock(data.rule.minStock != null ? String(data.rule.minStock) : "");
          setRuleMinPrice(data.rule.minPrice != null ? String(data.rule.minPrice) : "");
          setRuleMaxPrice(data.rule.maxPrice != null ? String(data.rule.maxPrice) : "");
          setRuleActive(Boolean(data.rule.isActive));
        }
      } catch (err) {
        console.error("Load publish rule error:", err);
      } finally {
        setRuleLoading(false);
      }
    }
    loadPublishRule();
  }, []);

  useEffect(() => {
    async function loadRepricingSettings() {
      try {
        const res = await fetch("/api/settings/buybox-repricing");
        const data = await res.json();
        if (data?.settings) {
          setRepriceActive(Boolean(data.settings.isActive));
          setRepriceStrategy(data.settings.strategy || "undercut_amount");
          setRepriceUndercutValue(
            data.settings.undercutValue != null ? String(data.settings.undercutValue) : "1"
          );
          setRepriceMinMarginPct(
            data.settings.minMarginPct != null ? String(data.settings.minMarginPct) : ""
          );
        }
      } catch (err) {
        console.error("Load buybox repricing settings error:", err);
      } finally {
        setRepriceLoading(false);
      }
    }
    loadRepricingSettings();
  }, []);

  async function handleSaveRepricingSettings() {
    setRepriceSaving(true);
    setTiersMessage(null);
    try {
      const res = await fetch("/api/settings/buybox-repricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isActive: repriceActive,
          strategy: repriceStrategy,
          undercutValue: repriceUndercutValue.trim() ? parseFloat(repriceUndercutValue) : 1,
          minMarginPct: repriceMinMarginPct.trim() ? parseFloat(repriceMinMarginPct) : null
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Ayarlar kaydedilemedi."));
      setTiersMessage({ type: "success", text: "Otomatik yeniden fiyatlandırma ayarları kaydedildi." });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Ayarlar kaydedilirken hata oluştu."
      });
    } finally {
      setRepriceSaving(false);
    }
  }

  async function handleRunRepricingNow() {
    if (
      !confirm(
        "Otomatik yeniden fiyatlandırma şimdi çalıştırılacak: 'Otomatik takip' açık ürünlerin fiyatı hesaplanıp doğrudan Trendyol'a gönderilecek. Devam edilsin mi?"
      )
    ) {
      return;
    }
    setRepriceRunning(true);
    setTiersMessage(null);
    try {
      const res = await fetch("/api/integrations/trendyol/buybox-reprice", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(data, "Çalıştırılamadı."));
      setTiersMessage({
        type: "success",
        text: `Tamamlandı: ${data.evaluatedCount} ürün değerlendirildi, ${data.appliedCount} fiyat güncellendi, ${data.skippedCount} değişiklik gerekmedi, ${data.failedPushCount} gönderim hatası.`
      });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Çalıştırılırken hata oluştu."
      });
    } finally {
      setRepriceRunning(false);
    }
  }

  async function handleSavePublishRule() {
    setRuleSaving(true);
    setTiersMessage(null);
    try {
      const res = await fetch("/api/settings/publish-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minStock: ruleMinStock.trim() ? parseInt(ruleMinStock, 10) : null,
          minPrice: ruleMinPrice.trim() ? parseFloat(ruleMinPrice) : null,
          maxPrice: ruleMaxPrice.trim() ? parseFloat(ruleMaxPrice) : null,
          isActive: ruleActive
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Kural kaydedilemedi."));
      }
      setTiersMessage({ type: "success", text: "Yayın kısıtlama kuralı kaydedildi." });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Kural kaydedilirken hata oluştu."
      });
    } finally {
      setRuleSaving(false);
    }
  }

  async function handleAddTier() {
    setAddingTier(true);
    setTiersMessage(null);
    try {
      const res = await fetch("/api/settings/pricing-tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newTierForm.label || null,
          minCostPrice: parseFloat(newTierForm.minCostPrice),
          maxCostPrice: newTierForm.maxCostPrice ? parseFloat(newTierForm.maxCostPrice) : null,
          commissionRate: parseFloat(newTierForm.commissionRate),
          cargoCost: parseFloat(newTierForm.cargoCost),
          targetProfitRate: parseFloat(newTierForm.targetProfitRate)
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Aralık eklenemedi."));
      }
      setTiers((prev) =>
        [...prev, data.tier].sort((a, b) => a.minCostPrice - b.minCostPrice)
      );
      setNewTierForm(EMPTY_TIER_FORM);
      setTiersMessage({ type: "success", text: "Fiyat aralığı eklendi." });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Aralık eklenirken hata oluştu."
      });
    } finally {
      setAddingTier(false);
    }
  }

  function startEditTier(tier: PricingTier) {
    setEditingTierId(tier.id);
    setEditTierForm({
      label: tier.label ?? "",
      minCostPrice: String(tier.minCostPrice),
      maxCostPrice: tier.maxCostPrice != null ? String(tier.maxCostPrice) : "",
      commissionRate: String(tier.commissionRate),
      cargoCost: String(tier.cargoCost),
      targetProfitRate: String(tier.targetProfitRate)
    });
  }

  async function handleSaveTierEdit(id: string) {
    setSavingTierEdit(true);
    setTiersMessage(null);
    try {
      const res = await fetch(`/api/settings/pricing-tiers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: editTierForm.label || null,
          minCostPrice: parseFloat(editTierForm.minCostPrice),
          maxCostPrice: editTierForm.maxCostPrice ? parseFloat(editTierForm.maxCostPrice) : null,
          commissionRate: parseFloat(editTierForm.commissionRate),
          cargoCost: parseFloat(editTierForm.cargoCost),
          targetProfitRate: parseFloat(editTierForm.targetProfitRate),
          isActive: true
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Aralık güncellenemedi."));
      }
      setTiers((prev) =>
        prev
          .map((t) => (t.id === id ? data.tier : t))
          .sort((a, b) => a.minCostPrice - b.minCostPrice)
      );
      setEditingTierId(null);
      setTiersMessage({ type: "success", text: "Fiyat aralığı güncellendi." });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Aralık güncellenirken hata oluştu."
      });
    } finally {
      setSavingTierEdit(false);
    }
  }

  async function handleDeleteTier(id: string) {
    if (!confirm("Bu fiyat aralığını silmek istediğinizden emin misiniz?")) return;
    setDeletingTierId(id);
    setTiersMessage(null);
    try {
      const res = await fetch(`/api/settings/pricing-tiers/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Aralık silinemedi."));
      }
      setTiers((prev) => prev.filter((t) => t.id !== id));
      setTiersMessage({ type: "success", text: "Fiyat aralığı silindi." });
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Aralık silinirken hata oluştu."
      });
    } finally {
      setDeletingTierId(null);
    }
  }

  async function handleToggleAutoApply(nextValue: boolean) {
    setAutoApplySaving(true);
    setTiersMessage(null);
    try {
      const res = await fetch("/api/settings/feature-flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: PRICING_TIER_AUTO_APPLY_KEY, value: nextValue })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Ayar kaydedilemedi."));
      }
      setAutoApplyEnabled(nextValue);
    } catch (err) {
      setTiersMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Mod değiştirilirken hata oluştu."
      });
    } finally {
      setAutoApplySaving(false);
    }
  }

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
          fallbackCategory: fallbackCategory || null,
          xmlBarcodePrefix: xmlBarcodePrefix || null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        const hint =
          typeof data?.details === "string" && data.details.trim()
            ? ` ${data.details.trim()}`
            : "";
        throw new Error(extractApiErrorMessage(data, "Kaydetme başarısız.") + hint);
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
          Varsayılan ticari ayarlarınızı yönetin.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className={`btn-secondary ${activeTab === "general" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("general")}>
          Genel
        </button>
        <button className={`btn-secondary ${activeTab === "pricing" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("pricing")}>
          Fiyatlandırma
        </button>
        <button className={`btn-secondary ${activeTab === "tiers" ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`} onClick={() => setActiveTab("tiers")}>
          Kademeli Fiyatlandırma
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

      <PermissionGate permission="marketplace.integrations.manage">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Hepsiburada Partner API
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Merchant ID ve kimlik bilgilerinizi şifreli saklayın ve bağlantıyı test edin.
            </p>
          </div>
          <Link
            href="/settings/hepsiburada"
            className="btn-primary"
          >
            Hepsiburada ayarları →
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
        {activeTab === "general" && (
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        {/* Dışa aktarma / pazaryeri gönderim yedek değerleri — Genel sekmesinin bir parçası */}
        {activeTab === "general" && (
          <Card className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Dışa Aktarma Yedek Değerleri
          </h2>

          <p className="text-xs text-slate-400">
            Trendyol ve diğer pazaryeri dışa aktarmalarında, ürünlerde bu alanlar boşsa aşağıdaki değerler kullanılır.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Yedek Marka</label>
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
              <label className="label">Yedek Kategori</label>
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
            <div>
              <label className="label">XML Barkod Ön Eki</label>
              <Input
                type="text"
                value={xmlBarcodePrefix}
                onChange={(e) => setXmlBarcodePrefix(e.target.value)}
                placeholder="Örn: MPX-"
                maxLength={20}
              />
              <p className="text-xs text-slate-500 mt-1">
                XML/içe aktarmadan gelen gerçek barkodlara bu önek eklenir (örn. başka bir
                entegrasyondan geçerken çakışmayı önlemek için). Boş bırakılırsa hiçbir şey
                eklenmez.
              </p>
            </div>
          </div>
          </Card>
        )}
      </div>

      {activeTab === "tiers" && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Trendyol Yayın Modu
            </h2>
            <p className="text-xs text-slate-400">
              Otomatik mod: Trendyol'a yayınlarken satış fiyatı, ürünün maliyetine göre eşleşen
              aralıktaki (veya ürün bazlı özel değerler varsa onların) komisyon/kargo/kâr oranlarıyla
              otomatik yeniden hesaplanıp uygulanır. Öneri modu: hesaplama sadece ürün sayfasında
              gösterilir, siz "Bu Fiyatı Uygula"ya basmadan değişmez.
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleToggleAutoApply(false)}
                disabled={autoApplySaving}
                className={`btn-secondary ${!autoApplyEnabled ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`}
              >
                Öneri olarak göster
              </button>
              <button
                type="button"
                onClick={() => handleToggleAutoApply(true)}
                disabled={autoApplySaving}
                className={`btn-secondary ${autoApplyEnabled ? "!border-indigo-400/50 !bg-indigo-500/20" : ""}`}
              >
                Otomatik uygula
              </button>
              {autoApplySaving && <span className="text-xs text-slate-500">Kaydediliyor...</span>}
            </div>
          </Card>

          <Card className="space-y-4 border-amber-700/40">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Buybox Otomatik Yeniden Fiyatlandırma
            </h2>
            <p className="text-xs text-slate-400">
              Açıksa: her çalıştırmada, <strong>"Otomatik takip"</strong> işaretlediğiniz ürünler için
              buybox'ı kaybediyorsanız fiyat aşağıdaki stratejiye göre otomatik düşürülür ve Trendyol'a
              gönderilir. Ürün bazında "Otomatik takip" işaretlemediğiniz sürece hiçbir şey
              değişmez — çift güvenlik (mağaza açık + ürün açık).
            </p>
            {repriceLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={repriceActive}
                    onChange={(e) => setRepriceActive(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  Otomatik yeniden fiyatlandırma açık (mağaza geneli)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Strateji</label>
                    <select
                      className="input"
                      value={repriceStrategy}
                      onChange={(e) => setRepriceStrategy(e.target.value)}
                    >
                      <option value="undercut_amount">Buybox - Sabit ₺</option>
                      <option value="undercut_percent">Buybox - %</option>
                      <option value="match_buybox">Buybox'ı Tam Eşitle</option>
                    </select>
                  </div>
                  <div>
                    <label className="label text-xs">
                      {repriceStrategy === "undercut_percent" ? "Yüzde (%)" : "Tutar (₺)"}
                    </label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={repriceStrategy === "match_buybox"}
                      value={repriceUndercutValue}
                      onChange={(e) => setRepriceUndercutValue(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Min. Kâr Marjı (%, opsiyonel)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="örn. 10"
                      value={repriceMinMarginPct}
                      onChange={(e) => setRepriceMinMarginPct(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Min. kâr marjı doldurulursa, hesaplanan fiyat hiçbir zaman maliyet üzerinden bu
                  yüzdenin altına inmez (örn. maliyet ₺100, marj %10 ise taban ₺110'dur).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" onClick={handleSaveRepricingSettings} disabled={repriceSaving}>
                    {repriceSaving ? "Kaydediliyor..." : "Ayarları Kaydet"}
                  </Button>
                  <button
                    type="button"
                    onClick={handleRunRepricingNow}
                    disabled={repriceRunning || !repriceActive}
                    className="inline-flex items-center rounded-md border border-amber-600 px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-900/30 disabled:opacity-50"
                    title={!repriceActive ? "Önce mağaza genelinde aktif hale getirin" : undefined}
                  >
                    {repriceRunning ? "Çalıştırılıyor…" : "Şimdi Çalıştır"}
                  </button>
                  <a href="/reports/buybox" className="text-xs text-indigo-300 hover:underline">
                    Buybox İzleme raporuna git →
                  </a>
                </div>
              </>
            )}
          </Card>

          {tiersMessage && (
            <Alert variant={tiersMessage.type === "success" ? "success" : "error"}>
              {tiersMessage.text}
            </Alert>
          )}

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Yayın Kısıtlamaları (Stok / Fiyat)
            </h2>
            <p className="text-xs text-slate-400">
              Bu eşiklerin dışında kalan ürünler Trendyol'a gönderilmez (yayın anında engellenir,
              hata olarak döner). Boş bırakılan alanlarda kontrol yapılmaz.
            </p>
            {ruleLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label text-xs">Min. Stok</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="örn. 1"
                      value={ruleMinStock}
                      onChange={(e) => setRuleMinStock(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Min. Fiyat (₺)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="örn. 50"
                      value={ruleMinPrice}
                      onChange={(e) => setRuleMinPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Maks. Fiyat (₺)</label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="opsiyonel"
                      value={ruleMaxPrice}
                      onChange={(e) => setRuleMaxPrice(e.target.value)}
                    />
                  </div>
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={ruleActive}
                    onChange={(e) => setRuleActive(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-800"
                  />
                  Kural aktif
                </label>
                <Button type="button" onClick={handleSavePublishRule} disabled={ruleSaving}>
                  {ruleSaving ? "Kaydediliyor..." : "Kuralı Kaydet"}
                </Button>
              </>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Maliyet Fiyatı Aralıkları
            </h2>
            <p className="text-xs text-slate-400">
              Örnek: 0-100 ₺, 101-300 ₺, 301-500 ₺ gibi aralıklar tanımlayın. Üst sınırı boş
              bırakmak "ve üzeri" anlamına gelir. Ürün bazında özel olarak kaydedilmiş komisyon/kargo/kâr
              oranı varsa, o ürün için bu aralıklar yerine kendi değeri kullanılır.
            </p>

            {tiersLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                      <th className="py-2 pr-2">Aralık</th>
                      <th className="py-2 pr-2">Komisyon %</th>
                      <th className="py-2 pr-2">Kargo ₺</th>
                      <th className="py-2 pr-2">Hedef Kâr %</th>
                      <th className="py-2 pr-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-3 text-xs text-slate-500">
                          Henüz aralık tanımlanmamış. Aşağıdan ekleyebilirsiniz.
                        </td>
                      </tr>
                    )}
                    {tiers.map((tier) =>
                      editingTierId === tier.id ? (
                        <tr key={tier.id} className="border-b border-slate-800">
                          <td className="py-2 pr-2">
                            <div className="flex gap-1">
                              <Input
                                type="number"
                                className="w-20 text-xs"
                                value={editTierForm.minCostPrice}
                                onChange={(e) =>
                                  setEditTierForm((f) => ({ ...f, minCostPrice: e.target.value }))
                                }
                              />
                              <Input
                                type="number"
                                className="w-20 text-xs"
                                placeholder="≥ (boş=üzeri)"
                                value={editTierForm.maxCostPrice}
                                onChange={(e) =>
                                  setEditTierForm((f) => ({ ...f, maxCostPrice: e.target.value }))
                                }
                              />
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              type="number"
                              className="w-20 text-xs"
                              value={editTierForm.commissionRate}
                              onChange={(e) =>
                                setEditTierForm((f) => ({ ...f, commissionRate: e.target.value }))
                              }
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              type="number"
                              className="w-20 text-xs"
                              value={editTierForm.cargoCost}
                              onChange={(e) =>
                                setEditTierForm((f) => ({ ...f, cargoCost: e.target.value }))
                              }
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <Input
                              type="number"
                              className="w-20 text-xs"
                              value={editTierForm.targetProfitRate}
                              onChange={(e) =>
                                setEditTierForm((f) => ({ ...f, targetProfitRate: e.target.value }))
                              }
                            />
                          </td>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleSaveTierEdit(tier.id)}
                              disabled={savingTierEdit}
                              className="text-xs text-emerald-400 hover:underline mr-2"
                            >
                              Kaydet
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingTierId(null)}
                              className="text-xs text-slate-400 hover:underline"
                            >
                              İptal
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={tier.id} className="border-b border-slate-800">
                          <td className="py-2 pr-2 text-slate-200">{tier.label}</td>
                          <td className="py-2 pr-2 text-slate-200">%{tier.commissionRate}</td>
                          <td className="py-2 pr-2 text-slate-200">₺{tier.cargoCost}</td>
                          <td className="py-2 pr-2 text-slate-200">%{tier.targetProfitRate}</td>
                          <td className="py-2 pr-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => startEditTier(tier)}
                              className="text-xs text-indigo-400 hover:underline mr-2"
                            >
                              Düzenle
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTier(tier.id)}
                              disabled={deletingTierId === tier.id}
                              className="text-xs text-red-400 hover:underline"
                            >
                              Sil
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-xs text-slate-400 mb-2">Yeni Aralık Ekle</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className="label text-xs">Alt sınır (₺)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newTierForm.minCostPrice}
                    onChange={(e) => setNewTierForm((f) => ({ ...f, minCostPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">Üst sınır (₺)</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="boş = üzeri"
                    value={newTierForm.maxCostPrice}
                    onChange={(e) => setNewTierForm((f) => ({ ...f, maxCostPrice: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">Komisyon %</label>
                  <Input
                    type="number"
                    min="0"
                    max="99"
                    placeholder="20"
                    value={newTierForm.commissionRate}
                    onChange={(e) => setNewTierForm((f) => ({ ...f, commissionRate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">Kargo ₺</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="30"
                    value={newTierForm.cargoCost}
                    onChange={(e) => setNewTierForm((f) => ({ ...f, cargoCost: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label text-xs">Hedef Kâr %</label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="30"
                    value={newTierForm.targetProfitRate}
                    onChange={(e) => setNewTierForm((f) => ({ ...f, targetProfitRate: e.target.value }))}
                  />
                </div>
              </div>
              <Button
                type="button"
                onClick={handleAddTier}
                disabled={
                  addingTier ||
                  !newTierForm.minCostPrice ||
                  !newTierForm.commissionRate ||
                  !newTierForm.cargoCost ||
                  !newTierForm.targetProfitRate
                }
                className="mt-3"
              >
                {addingTier ? "Ekleniyor..." : "Aralık Ekle"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {activeTab !== "tiers" && (
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </Button>
        </div>
      )}
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
