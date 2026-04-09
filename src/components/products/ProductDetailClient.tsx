"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { ProductTrendyolMappingSection } from "./ProductTrendyolMappingSection";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category: string | null;
  brand: string | null;
  sku: string | null;
  status: string;
  lifecycleStatus: string;
  displayStatus: "active" | "out_of_stock" | "archived";
  mappingPublishStatus: string | null;
  hasTrendyolMapping: boolean;
  lastXmlSyncAt: string | null;
  lastMarketplaceSyncAt: string | null;
  marketplaceSyncStatus: string | null;
  marketplaceSyncError: string | null;
  marketplaceSyncSource: string | null;
  archivedAt: string | null;
  publishedAt: string | null;
  unpublishedAt: string | null;
  mainImageUrl: string | null;
  imageUrls: unknown;
  seoDescription: string | null;
  tags: string | null;
  createdAt: string;
  costPrice: number | null;
  commissionRate: number | null;
  cargoCost: number | null;
  vatRate: number | null;
  targetProfitRate: number | null;
};

type ActivityLog = {
  id: string;
  action: string;
  message: string;
  createdAt: string;
};

type OptimizedResult = {
  title: string;
  description: string;
  seoDescription: string;
  tags: string[];
};

type PricingResult = {
  minimumProfitablePrice: number;
  suggestedPrice: number;
  estimatedProfit: number;
  estimatedProfitRate: number;
  breakdown: {
    totalCost: number;
    commissionAmount: number;
    vatAmount: number;
    netRevenue: number;
  };
};

type DefaultSettings = {
  commissionRate: number | null;
  cargoCost: number | null;
  vatRate: number | null;
  targetProfitRate: number | null;
};

type Props = {
  product: Product;
  activityLogs: ActivityLog[];
  defaultSettings?: DefaultSettings;
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "Taslak", color: "bg-slate-600" },
  ready: { label: "Hazır", color: "bg-indigo-600" },
  published: { label: "Yayında", color: "bg-emerald-600" },
  unpublished: { label: "Yayından Kaldırılmış", color: "bg-amber-600" },
  archived: { label: "Arşivlenmiş", color: "bg-zinc-700" }
};

const DISPLAY_STATUS_MAP: Record<
  "active" | "out_of_stock" | "archived",
  { label: string; color: string }
> = {
  active: { label: "Aktif", color: "bg-emerald-600" },
  out_of_stock: { label: "Tükenen", color: "bg-amber-600" },
  archived: { label: "Arşivde", color: "bg-zinc-700" }
};

export function ProductDetailClient({ product, activityLogs, defaultSettings }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [optimized, setOptimized] = useState<OptimizedResult | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Maliyet: yalnızca XML feed senkronundan (Product.costPrice); yerel düzenleme yok
  // Pricing states - ürün değerleri yoksa kullanıcı ayarlarından varsayılan değerleri al
  const [commissionRate, setCommissionRate] = useState<string>(
    product.commissionRate?.toString() ??
      defaultSettings?.commissionRate?.toString() ??
      "20"
  );
  const [cargoCost, setCargoCost] = useState<string>(
    product.cargoCost?.toString() ??
      defaultSettings?.cargoCost?.toString() ??
      ""
  );
  const [vatRate, setVatRate] = useState<string>(
    product.vatRate?.toString() ??
      defaultSettings?.vatRate?.toString() ??
      "20"
  );
  const [targetProfitRate, setTargetProfitRate] = useState<string>(
    product.targetProfitRate?.toString() ??
      defaultSettings?.targetProfitRate?.toString() ??
      "30"
  );
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [applyingPrice, setApplyingPrice] = useState(false);
  const [pricingResult, setPricingResult] = useState<PricingResult | null>(null);
  const [savingImages, setSavingImages] = useState(false);
  const [mainImageUrl, setMainImageUrl] = useState(product.mainImageUrl ?? "");
  const [imageUrlsText, setImageUrlsText] = useState(
    Array.isArray(product.imageUrls)
      ? product.imageUrls.filter((x) => typeof x === "string").join("\n")
      : ""
  );

  async function handleDelete() {
    if (!confirm("Bu ürünü arşivlemek istediğinizden emin misiniz?")) return;

    setDeleting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE"
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Arşivleme başarısız.");
      }

      router.push("/products");
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Arşivleme sırasında hata oluştu."
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleOptimize() {
    setOptimizing(true);
    setMessage(null);
    setOptimized(null);

    try {
      const res = await fetch("/api/ai/optimize-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, apply: false })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "AI optimizasyonu başarısız.");
      }

      setOptimized(data.optimized);
      setMessage({
        type: "info",
        text: "AI önerisi hazır. Beğendiyseniz 'Uygula' butonuna basın."
      });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Optimizasyon sırasında hata oluştu."
      });
    } finally {
      setOptimizing(false);
    }
  }

  async function handleApply() {
    if (!optimized) return;

    setApplying(true);
    setMessage(null);

    try {
      const res = await fetch("/api/ai/optimize-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, apply: true })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Uygulama başarısız.");
      }

      setMessage({
        type: "success",
        text: "AI optimizasyonu ürüne uygulandı!"
      });
      setOptimized(null);
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error ? err.message : "Uygulama sırasında hata oluştu."
      });
    } finally {
      setApplying(false);
    }
  }

  async function handleCalculatePricing(save: boolean = false) {
    const costNum = product.costPrice;
    if (costNum == null || !Number.isFinite(costNum) || costNum < 0) {
      setMessage({
        type: "error",
        text:
          "Maliyet fiyatı XML feed ile gelir. Önce XML beslemenin senkron olduğundan emin olun."
      });
      return;
    }

    if (save) {
      setSavingPricing(true);
    } else {
      setCalculatingPrice(true);
    }
    setMessage(null);

    try {
      const res = await fetch(`/api/products/${product.id}/pricing-calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          costPrice: costNum,
          commissionRate: parseFloat(commissionRate) || 0,
          cargoCost: parseFloat(cargoCost) || 0,
          vatRate: parseFloat(vatRate) || 0,
          targetProfitRate: parseFloat(targetProfitRate) || 0,
          save
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Fiyat hesaplama başarısız.");
      }

      setPricingResult(data);

      if (save) {
        if (data.saveError) {
          setMessage({
            type: "error",
            text: data.saveError
          });
        } else {
          setMessage({
            type: "success",
            text: "Fiyat bilgileri kaydedildi!"
          });
          router.refresh();
        }
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Hesaplama sırasında hata oluştu."
      });
    } finally {
      setCalculatingPrice(false);
      setSavingPricing(false);
    }
  }

  async function handleApplyPrice(newPrice: number) {
    if (!confirm(`Ürün fiyatını ₺${newPrice.toLocaleString("tr-TR")} olarak güncellemek istiyor musunuz?`)) {
      return;
    }

    setApplyingPrice(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          price: newPrice,
          stock: product.stock
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Fiyat güncellenemedi.");
      }

      setMessage({
        type: "success",
        text: "Ürün fiyatı satış fiyatı olarak güncellendi"
      });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Fiyat güncellenirken hata oluştu."
      });
    } finally {
      setApplyingPrice(false);
    }
  }

  async function handleSaveImages() {
    setSavingImages(true);
    setMessage(null);
    try {
      const imageUrls = imageUrlsText
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          price: product.price,
          stock: product.stock,
          category: product.category,
          brand: product.brand,
          sku: product.sku,
          status: product.status,
          lifecycleStatus: product.lifecycleStatus,
          seoDescription: product.seoDescription,
          tags: product.tags,
          mainImageUrl: mainImageUrl.trim() || null,
          imageUrls: imageUrls.length > 0 ? imageUrls : null
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Görseller kaydedilemedi.");
      }
      setMessage({ type: "success", text: "Görseller kaydedildi." });
      router.refresh();
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err instanceof Error
            ? err.message
            : "Görseller kaydedilirken hata oluştu."
      });
    } finally {
      setSavingImages(false);
    }
  }

  const statusInfo = STATUS_MAP[product.lifecycleStatus] ?? STATUS_MAP.draft;
  const displayInfo = DISPLAY_STATUS_MAP[product.displayStatus] ?? DISPLAY_STATUS_MAP.active;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
          <p className="text-sm text-slate-400">Ürün detayları ve yönetimi</p>
        </div>
        <div className="flex gap-2">
          <PermissionGate permission="products.update">
            <Link
              href={`/products/${product.id}/edit`}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Düzenle
            </Link>
          </PermissionGate>
          <PermissionGate permission="products.archive">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-lg border border-red-700 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/30 disabled:opacity-50"
            >
              {deleting ? "Arşivleniyor..." : "Arşivle"}
            </button>
          </PermissionGate>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-800 bg-emerald-900/30 text-emerald-200"
              : message.type === "error"
                ? "border-red-800 bg-red-900/30 text-red-200"
                : "border-slate-700 bg-slate-800/60 text-slate-300"
          }`}
          role="alert"
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sol kolon: Ürün bilgileri */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
            Ürün Bilgileri
          </h2>

          <div className="grid gap-4">
            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Durum</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Ürün Durumu</span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${displayInfo.color}`}
              >
                {displayInfo.label}
              </span>
            </div>

            {product.publishedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Yayınlanma</span>
                <span className="text-sm text-slate-100">
                  {new Date(product.publishedAt).toLocaleString("tr-TR")}
                </span>
              </div>
            )}

            {product.unpublishedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Yayından kaldırılma</span>
                <span className="text-sm text-slate-100">
                  {new Date(product.unpublishedAt).toLocaleString("tr-TR")}
                </span>
              </div>
            )}

            {product.archivedAt && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Arşivlenme</span>
                <span className="text-sm text-slate-100">
                  {new Date(product.archivedAt).toLocaleString("tr-TR")}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Fiyat</span>
              <span className="text-sm font-medium text-slate-100">
                ₺{product.price.toLocaleString("tr-TR")}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Stok</span>
              <span className="text-sm font-medium text-slate-100">
                {product.stock} adet
              </span>
            </div>

            {product.category && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Kategori</span>
                <span className="text-sm text-slate-100">{product.category}</span>
              </div>
            )}

            {product.brand && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Marka</span>
                <span className="text-sm text-slate-100">{product.brand}</span>
              </div>
            )}

            {product.sku && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">SKU</span>
                <span className="text-sm text-slate-100 font-mono">
                  {product.sku}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-sm text-slate-400">Oluşturulma</span>
              <span className="text-sm text-slate-100">
                {new Date(product.createdAt).toLocaleString("tr-TR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>
          </div>

          {product.description && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-xs text-slate-400 mb-1">Açıklama</h3>
              <p className="text-sm text-slate-200 whitespace-pre-wrap">
                {product.description}
              </p>
            </div>
          )}

          {product.seoDescription && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-xs text-slate-400 mb-1">SEO Açıklaması</h3>
              <p className="text-sm text-slate-200">{product.seoDescription}</p>
            </div>
          )}

          {product.tags && (
            <div className="border-t border-slate-700 pt-4">
              <h3 className="text-xs text-slate-400 mb-2">Etiketler</h3>
              <div className="flex flex-wrap gap-1.5">
                {product.tags.split(",").map((tag, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200"
                  >
                    {tag.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          <PermissionGate permission="products.update">
            <div className="border-t border-slate-700 pt-4 space-y-3">
              <h3 className="text-xs text-slate-400">Görseller</h3>
              <div>
                <label className="text-xs text-slate-500">Ana Görsel URL</label>
                <input
                  className="input mt-1 text-sm"
                  value={mainImageUrl}
                  onChange={(e) => setMainImageUrl(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">
                  Ek Görseller (her satıra bir URL)
                </label>
                <textarea
                  className="input mt-1 min-h-[100px] text-sm"
                  value={imageUrlsText}
                  onChange={(e) => setImageUrlsText(e.target.value)}
                  placeholder={"https://.../1.jpg\nhttps://.../2.jpg"}
                />
              </div>
              <button
                type="button"
                onClick={handleSaveImages}
                disabled={savingImages}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                {savingImages ? "Kaydediliyor..." : "Görselleri Kaydet"}
              </button>
            </div>
          </PermissionGate>
        </div>

        {/* Sağ kolon: AI + Loglar */}
        <div className="space-y-6">
          {/* AI Optimize */}
          <PermissionGate permission="products.update">
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
                AI ile Optimize Et
              </h2>

              <p className="text-xs text-slate-400">
                Ürün başlığını, açıklamasını ve SEO bilgilerini AI ile optimize edin.
              </p>

              <button
                type="button"
                onClick={handleOptimize}
                disabled={optimizing}
                className="btn-primary w-full"
              >
                {optimizing ? "AI çalışıyor..." : "AI Önerisi Al"}
              </button>

              {optimized && (
                <div className="space-y-3 border-t border-slate-700 pt-4">
                  <h3 className="text-xs text-slate-400 uppercase tracking-wider">
                    AI Önerisi (Önizleme)
                  </h3>

                  <div>
                    <span className="text-xs text-slate-500">Başlık:</span>
                    <p className="text-sm text-emerald-300">{optimized.title}</p>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500">Açıklama:</span>
                    <p className="text-sm text-emerald-300 whitespace-pre-wrap">
                      {optimized.description}
                    </p>
                  </div>

                  <div>
                    <span className="text-xs text-slate-500">SEO Açıklaması:</span>
                    <p className="text-sm text-emerald-300">
                      {optimized.seoDescription}
                    </p>
                  </div>

                  {optimized.tags.length > 0 && (
                    <div>
                      <span className="text-xs text-slate-500">Etiketler:</span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {optimized.tags.map((tag, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center rounded bg-emerald-800/40 px-2 py-0.5 text-xs text-emerald-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={handleApply}
                      disabled={applying}
                      className="btn-primary flex-1"
                    >
                      {applying ? "Uygulanıyor..." : "Uygula"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOptimized(null)}
                      className="flex-1 inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
                    >
                      İptal
                    </button>
                  </div>
                </div>
              )}
            </div>
          </PermissionGate>

          {/* Fiyat Önerisi */}
          <PermissionGate permission="products.update">
            <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Fiyat Önerisi
            </h2>

            <p className="text-xs text-slate-400">
              Maliyet, XML beslemedeki ürün fiyatından alınır ve satış fiyatı güncellemelerinden
              etkilenmez. Komisyon, kargo ve kâr oranlarını ayarlayıp önerilen satış fiyatını
              hesaplayın.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Maliyet Fiyatı (₺) — XML
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly
                  tabIndex={-1}
                  value={
                    product.costPrice != null && Number.isFinite(product.costPrice)
                      ? String(product.costPrice)
                      : ""
                  }
                  className="input cursor-not-allowed bg-slate-900/60 text-sm text-slate-200"
                  placeholder="XML senkronu sonrası"
                  title="Bu değer XML feed senkronu ile doldurulur; elle değiştirilemez."
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Kaynak: XML’deki fiyat. İlk eşleşmede veya maliyet boşken senkron yazılır; sonrasında
                  sabit kalır.
                </p>
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Komisyon Oranı (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="99"
                  step="0.1"
                  value={commissionRate}
                  onChange={(e) => setCommissionRate(e.target.value)}
                  className="input text-sm"
                  placeholder="20"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Kargo Maliyeti (₺)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cargoCost}
                  onChange={(e) => setCargoCost(e.target.value)}
                  className="input text-sm"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  KDV Oranı (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="input text-sm"
                  placeholder="20"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Hedef Kâr Oranı (%)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={targetProfitRate}
                  onChange={(e) => setTargetProfitRate(e.target.value)}
                  className="input text-sm"
                  placeholder="30"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleCalculatePricing(false)}
              disabled={
                calculatingPrice ||
                product.costPrice == null ||
                !Number.isFinite(product.costPrice)
              }
              className="btn-primary w-full"
            >
              {calculatingPrice ? "Hesaplanıyor..." : "Fiyat Hesapla"}
            </button>

            {pricingResult && (
              <div className="space-y-3 border-t border-slate-700 pt-4">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider">
                  Hesaplama Sonuçları
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <div className="text-xs text-slate-400">Min. Kârlı Fiyat</div>
                    <div className="text-lg font-semibold text-amber-400">
                      ₺{pricingResult.minimumProfitablePrice.toLocaleString("tr-TR")}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyPrice(pricingResult.minimumProfitablePrice)}
                      disabled={applyingPrice}
                      className="mt-2 w-full text-xs rounded border border-amber-600/50 px-2 py-1 text-amber-400 hover:bg-amber-900/30 disabled:opacity-50"
                    >
                      Bu Fiyatı Uygula
                    </button>
                  </div>
                  <div className="rounded-lg bg-emerald-900/30 p-3">
                    <div className="text-xs text-emerald-300/80">Önerilen Fiyat</div>
                    <div className="text-lg font-semibold text-emerald-300">
                      ₺{pricingResult.suggestedPrice.toLocaleString("tr-TR")}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyPrice(pricingResult.suggestedPrice)}
                      disabled={applyingPrice}
                      className="mt-2 w-full text-xs rounded border border-emerald-600/50 px-2 py-1 text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50"
                    >
                      Bu Fiyatı Uygula
                    </button>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <div className="text-xs text-slate-400">Tahmini Kâr</div>
                    <div className="text-lg font-semibold text-slate-100">
                      ₺{pricingResult.estimatedProfit.toLocaleString("tr-TR")}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 p-3">
                    <div className="text-xs text-slate-400">Kâr Oranı</div>
                    <div className="text-lg font-semibold text-slate-100">
                      %{pricingResult.estimatedProfitRate.toLocaleString("tr-TR")}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Toplam Maliyet:</span>
                    <span>₺{pricingResult.breakdown.totalCost.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Komisyon Tutarı:</span>
                    <span>₺{pricingResult.breakdown.commissionAmount.toLocaleString("tr-TR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Gelir:</span>
                    <span>₺{pricingResult.breakdown.netRevenue.toLocaleString("tr-TR")}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleCalculatePricing(true)}
                  disabled={savingPricing}
                  className="w-full inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                >
                  {savingPricing ? "Kaydediliyor..." : "Bu Değerleri Kaydet"}
                </button>
              </div>
            )}
            </div>
          </PermissionGate>

          {/* Aktivite Logları */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
              Bu Ürüne Ait İşlem Geçmişi
            </h2>

            {activityLogs.length === 0 ? (
              <p className="text-sm text-slate-400">
                Bu ürünle ilgili henüz işlem kaydı yok.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {activityLogs.map((log) => (
                  <li key={log.id} className="py-2 text-sm">
                    <div className="text-xs text-slate-500">
                      {new Date(log.createdAt).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </div>
                    <div className="text-slate-100">{log.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ProductTrendyolMappingSection
        productId={product.id}
        syncSnapshot={{
          hasTrendyolMapping: product.hasTrendyolMapping,
          lastXmlSyncAt: product.lastXmlSyncAt,
          lastMarketplaceSyncAt: product.lastMarketplaceSyncAt,
          marketplaceSyncStatus: product.marketplaceSyncStatus,
          marketplaceSyncError: product.marketplaceSyncError,
          marketplaceSyncSource: product.marketplaceSyncSource
        }}
      />
    </div>
  );
}
