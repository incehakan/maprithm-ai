"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PermissionGate } from "@/components/auth/PermissionGate";
import { TrendyolBrandSearchSelect } from "@/components/trendyol/TrendyolBrandSearchSelect";

type CatOpt = { categoryId: number; name: string; isLeaf: boolean };
type CatAttrVal = { attributeValueId: number; attributeValue: string };
type CatAttr = {
  id: string;
  categoryId: number;
  attributeId: number;
  attributeName: string;
  isRequired: boolean;
  isVariantable: boolean;
  allowCustom: boolean;
  values: CatAttrVal[];
};

type MappingAttr = {
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  customValue: string | null;
};

type MappingPayload = {
  id?: string;
  trendyolBrandId: number | null;
  trendyolCategoryId: number | null;
  barcode: string | null;
  stockCode: string | null;
  productMainId: string | null;
  cargoCompanyId: number | null;
  dimensionalWeight: number | null;
  currencyType: string;
  vatRate: number | null;
  listPrice: number | null;
  salePrice: number | null;
  quantity: number | null;
  useProductPrice?: boolean;
  useProductStock?: boolean;
  publishStatus: string;
  publishedAt?: string | null;
  batchRequestId: string | null;
  lastErrorMessage: string | null;
  mainImageUrl: string | null;
  imageUrls?: unknown;
  attributes?: MappingAttr[];
};

type Readiness = { ready: boolean; missing: string[] };
type EffectiveCommercials = {
  salePrice: number;
  listPrice: number;
  quantity: number;
  barcode?: string | null;
  productPrice?: number;
  overrideSalePrice?: number | null;
};

type Props = { productId: string };

function SearchableSelect<T>({
  label,
  options,
  value,
  onChange,
  getId,
  getLabel,
  placeholder,
  disabled
}: {
  label: string;
  options: T[];
  value: number | null;
  onChange: (id: number | null) => void;
  getId: (o: T) => number;
  getLabel: (o: T) => string;
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const selected = useMemo(
    () => options.find((o) => getId(o) === value) ?? null,
    [options, value, getId]
  );

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return options.slice(0, 150);
    return options
      .filter((o) => getLabel(o).toLowerCase().includes(qq))
      .slice(0, 200);
  }, [options, q, getLabel]);

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="input"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? q : selected ? getLabel(selected) : ""}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQ(selected ? getLabel(selected) : "");
          }}
          onBlur={() => {
            setTimeout(() => setOpen(false), 200);
          }}
        />
        {open && !disabled && (
          <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-600 bg-slate-900 py-1 text-sm shadow-lg">
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-slate-400 hover:bg-slate-800"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(null);
                  setQ("");
                  setOpen(false);
                }}
              >
                — Seçimi temizle —
              </button>
            </li>
            {filtered.map((o) => {
              const id = getId(o);
              return (
                <li key={id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(id);
                      setQ("");
                      setOpen(false);
                    }}
                  >
                    {getLabel(o)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProductTrendyolMappingSection({ productId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedBrandName, setPickedBrandName] = useState<string | null>(null);
  const [categories, setCategories] = useState<CatOpt[]>([]);
  const [categoryAttributes, setCategoryAttributes] = useState<CatAttr[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  const [trendyolBrandId, setTrendyolBrandId] = useState<number | null>(null);
  const [trendyolCategoryId, setTrendyolCategoryId] = useState<number | null>(
    null
  );
  const [barcode, setBarcode] = useState("");
  const [stockCode, setStockCode] = useState("");
  const [productMainId, setProductMainId] = useState("");
  const [cargoCompanyId, setCargoCompanyId] = useState("");
  const [dimensionalWeight, setDimensionalWeight] = useState("");
  const [currencyType, setCurrencyType] = useState("TRY");
  const [vatRate, setVatRate] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [publishStatus, setPublishStatus] = useState("draft");
  const [useProductPrice, setUseProductPrice] = useState(true);
  const [useProductStock, setUseProductStock] = useState(true);
  const [effectiveCommercials, setEffectiveCommercials] =
    useState<EffectiveCommercials | null>(null);
  const [batchRequestId, setBatchRequestId] = useState<string | null>(null);
  const [mappingPublishedAt, setMappingPublishedAt] = useState<string | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [updatingPriceStock, setUpdatingPriceStock] = useState(false);
  const [updatingContent, setUpdatingContent] = useState(false);
  const [deletingFromPlatform, setDeletingFromPlatform] = useState(false);
  const [publishFlash, setPublishFlash] = useState<{
    type: "ok" | "err";
    text: string;
    missing?: string[];
  } | null>(null);
  const [mainImageUrl, setMainImageUrl] = useState("");
  const [imageUrlsText, setImageUrlsText] = useState("");
  const [attrState, setAttrState] = useState<
    Record<number, { valueId: number | null; custom: string }>
  >({});

  const load = useCallback(
    async (previewCategoryId?: number | null) => {
      setError(null);
      const isPreview =
        previewCategoryId != null &&
        Number.isFinite(previewCategoryId) &&
        previewCategoryId > 0;
      const qs = isPreview ? `?previewCategoryId=${previewCategoryId}` : "";
      const res = await fetch(`/api/products/${productId}/trendyol-mapping${qs}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Veri yüklenemedi.");
      }

      if (data.defaults && !data.mapping && !isPreview) {
        const d = data.defaults;
        setTrendyolBrandId(d.trendyolBrandId);
        setTrendyolCategoryId(d.trendyolCategoryId);
        setBarcode(d.barcode ?? "");
        setStockCode(d.stockCode ?? "");
        setProductMainId(d.productMainId ?? "");
        setCargoCompanyId("");
        setDimensionalWeight(
          d.dimensionalWeight != null ? String(d.dimensionalWeight) : ""
        );
        setCurrencyType(d.currencyType || "TRY");
        setVatRate(d.vatRate != null ? String(d.vatRate) : "");
        setListPrice(d.listPrice != null ? String(d.listPrice) : "");
        setSalePrice(d.salePrice != null ? String(d.salePrice) : "");
        setQuantity(d.quantity != null ? String(d.quantity) : "");
        setUseProductPrice(d.useProductPrice !== false);
        setUseProductStock(d.useProductStock !== false);
        setPublishStatus(d.publishStatus || "draft");
        setMainImageUrl(d.mainImageUrl ?? "");
        setImageUrlsText(
          Array.isArray(d.imageUrls)
            ? d.imageUrls.filter((x: unknown) => typeof x === "string").join("\n")
            : ""
        );
        setBatchRequestId(null);
        setMappingPublishedAt(null);
        setLastErrorMessage(null);
      }

      if (data.mapping && !isPreview) {
        const m = data.mapping as MappingPayload;
        setTrendyolBrandId(m.trendyolBrandId);
        setTrendyolCategoryId(m.trendyolCategoryId);
        setBarcode(m.barcode ?? "");
        setStockCode(m.stockCode ?? "");
        setProductMainId(m.productMainId ?? "");
        setCargoCompanyId(
          m.cargoCompanyId != null ? String(m.cargoCompanyId) : ""
        );
        setDimensionalWeight(
          m.dimensionalWeight != null ? String(m.dimensionalWeight) : ""
        );
        setCurrencyType(m.currencyType || "TRY");
        setVatRate(m.vatRate != null ? String(m.vatRate) : "");
        setListPrice(m.listPrice != null ? String(m.listPrice) : "");
        setSalePrice(m.salePrice != null ? String(m.salePrice) : "");
        setQuantity(m.quantity != null ? String(m.quantity) : "");
        setUseProductPrice(m.useProductPrice !== false);
        setUseProductStock(m.useProductStock !== false);
        setPublishStatus(m.publishStatus || "draft");
        setMainImageUrl(m.mainImageUrl ?? "");
        setImageUrlsText(
          Array.isArray(m.imageUrls)
            ? m.imageUrls.filter((x: unknown) => typeof x === "string").join("\n")
            : ""
        );
        setBatchRequestId(m.batchRequestId ?? null);
        setMappingPublishedAt(m.publishedAt ?? null);
        setLastErrorMessage(m.lastErrorMessage ?? null);
      }

      setPickedBrandName(
        typeof data.trendyolBrandName === "string" &&
          data.trendyolBrandName.trim()
          ? data.trendyolBrandName.trim()
          : null
      );
      setCategories(data.categories ?? []);
      setCategoryAttributes(data.categoryAttributes ?? []);
      setReadiness(data.readiness ?? null);
      setEffectiveCommercials(data.effectiveCommercials ?? null);

      const attrsFromApi: CatAttr[] = data.categoryAttributes ?? [];
      const saved: MappingAttr[] = data.mapping?.attributes ?? [];
      const next: Record<number, { valueId: number | null; custom: string }> =
        {};
      for (const ca of attrsFromApi) {
        const s = saved.find((x) => x.attributeId === ca.attributeId);
        next[ca.attributeId] = {
          valueId: s?.attributeValueId ?? null,
          custom: s?.customValue ?? ""
        };
      }
      setAttrState(next);
    },
    [productId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        await load(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Yükleme hatası");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function handleCategoryChange(cid: number | null) {
    setTrendyolCategoryId(cid);
    if (cid == null) {
      setCategoryAttributes([]);
      try {
        await load(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Yenileme hatası");
      }
      return;
    }
    try {
      await load(cid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Özellikler yüklenemedi");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const attrs = categoryAttributes.map((ca) => {
        const st = attrState[ca.attributeId] ?? {
          valueId: null,
          custom: ""
        };
        return {
          attributeId: ca.attributeId,
          attributeName: ca.attributeName,
          attributeValueId: st.valueId,
          customValue: st.custom.trim() || null
        };
      });

      const body = {
        trendyolBrandId,
        trendyolCategoryId,
        barcode: barcode.trim() || null,
        stockCode: stockCode.trim() || null,
        productMainId: productMainId.trim() || null,
        cargoCompanyId: cargoCompanyId.trim()
          ? parseInt(cargoCompanyId, 10)
          : null,
        dimensionalWeight: dimensionalWeight.trim()
          ? parseFloat(dimensionalWeight)
          : null,
        currencyType: currencyType.trim() || "TRY",
        vatRate: vatRate.trim() ? parseFloat(vatRate) : null,
        listPrice: listPrice.trim() ? parseFloat(listPrice) : null,
        salePrice: salePrice.trim() ? parseFloat(salePrice) : null,
        quantity: quantity.trim() ? parseInt(quantity, 10) : null,
        useProductPrice,
        useProductStock,
        publishStatus: publishStatus || "draft",
        mainImageUrl: mainImageUrl.trim() || null,
        imageUrls: imageUrlsText
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean),
        attributes: attrs
      };

      const res = await fetch(`/api/products/${productId}/trendyol-mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Kayıt başarısız.");
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setSaving(false);
    }
  }

  async function handleTrendyolPublish() {
    setPublishing(true);
    setPublishFlash(null);
    setError(null);
    try {
      const res = await fetch(
        `/api/products/${productId}/trendyol-publish`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const missing = Array.isArray(data.missing) ? data.missing : [];
        setPublishFlash({
          type: "err",
          text:
            typeof data.error === "string"
              ? data.error
              : "Trendyol gönderimi başarısız oldu.",
          missing: missing.length ? missing : undefined
        });
        await load(trendyolCategoryId);
        router.refresh();
        return;
      }

      setPublishFlash({
        type: "ok",
        text:
          typeof data.message === "string"
            ? data.message
            : "İstek Trendyol'a iletildi."
      });
      if (typeof data.batchRequestId === "string" && data.batchRequestId) {
        setBatchRequestId(data.batchRequestId);
      }
      if (typeof data.publishStatus === "string") {
        setPublishStatus(data.publishStatus);
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text: e instanceof Error ? e.message : "Ağ hatası."
      });
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnpublish() {
    if (!confirm("Ürünü Trendyol'da yayından kaldırmak istiyor musunuz?")) {
      return;
    }
    setUnpublishing(true);
    setPublishFlash(null);
    try {
      const res = await fetch(`/api/products/${productId}/trendyol-unpublish`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Yayından kaldırma başarısız.");
      }
      setPublishFlash({ type: "ok", text: "Ürün arşive alındı." });
      setPublishStatus("archived");
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text: e instanceof Error ? e.message : "Yayından kaldırma başarısız."
      });
    } finally {
      setUnpublishing(false);
    }
  }

  async function handleToggleArchive(nextArchived: boolean) {
    const confirmText = nextArchived
      ? "Ürünü arşivlemek istiyor musunuz?"
      : "Bu ürün Trendyol'da arşivden çıkarılacaktır. Devam etmek istiyor musunuz?";
    if (!confirm(confirmText)) return;
    setArchiving(true);
    setPublishFlash(null);
    try {
      const res = await fetch(`/api/integrations/trendyol/toggle-archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, archived: nextArchived })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Arşiv işlemi başarısız.");
      }
      setPublishFlash({
        type: "ok",
        text: nextArchived
          ? "Ürün arşivlendi."
          : "Ürün Trendyol'da arşivden çıkarıldı"
      });
      setPublishStatus(nextArchived ? "archived" : "published");
      if (typeof data.batchRequestId === "string" && data.batchRequestId) {
        setBatchRequestId(data.batchRequestId);
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text: e instanceof Error ? e.message : "Arşiv işlemi başarısız."
      });
    } finally {
      setArchiving(false);
    }
  }

  async function handlePriceStockUpdate() {
    if (
      !confirm(
        "Bu işlem Trendyol’daki yayındaki ürünün fiyat ve stok bilgisini güncelleyecektir. Devam etmek istiyor musunuz?"
      )
    ) {
      return;
    }

    setUpdatingPriceStock(true);
    setPublishFlash(null);
    setError(null);
    try {
      const res = await fetch(`/api/integrations/trendyol/update-price-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Fiyat/stok güncellemesi gönderilemedi"
        );
      }
      setPublishFlash({
        type: "ok",
        text:
          typeof data.message === "string"
            ? data.message
            : "Fiyat/stok güncellemesi Trendyol'a gönderildi."
      });
      if (typeof data.batchRequestId === "string" && data.batchRequestId) {
        setBatchRequestId(data.batchRequestId);
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text:
          e instanceof Error
            ? e.message
            : "Fiyat/stok güncellemesi gönderilemedi"
      });
    } finally {
      setUpdatingPriceStock(false);
    }
  }

  const trendyolPublishBadgeClass = useMemo(() => {
    const s = (publishStatus || "draft").toLowerCase();
    if (s === "published")
      return "bg-emerald-900/55 text-emerald-200 border-emerald-600/50";
    if (s === "sent")
      return "bg-teal-900/50 text-teal-200 border-teal-700/50";
    if (s === "processing") return "bg-sky-900/50 text-sky-200 border-sky-700/50";
    if (s === "failed") return "bg-red-900/50 text-red-200 border-red-800/50";
    if (s === "unpublished")
      return "bg-amber-900/50 text-amber-200 border-amber-700/50";
    if (s === "archived") return "bg-zinc-900/50 text-zinc-200 border-zinc-700/50";
    return "bg-slate-800 text-slate-300 border-slate-600";
  }, [publishStatus]);

  const trendyolPublishLabel = useMemo(() => {
    const s = (publishStatus || "draft").toLowerCase();
    if (s === "published") return "Yayında";
    if (s === "sent") return "Gönderildi";
    if (s === "processing") return "İşleniyor";
    if (s === "failed") return "Başarısız";
    if (s === "unpublished") return "Yayından Kaldırıldı";
    if (s === "archived") return "Arşivlendi";
    return "Taslak";
  }, [publishStatus]);

  const salePriceInputValue = useMemo(() => {
    if (useProductPrice && effectiveCommercials) {
      return String(effectiveCommercials.salePrice);
    }
    return salePrice;
  }, [useProductPrice, effectiveCommercials, salePrice]);

  const quantityInputValue = useMemo(() => {
    if (useProductStock && effectiveCommercials) {
      return String(effectiveCommercials.quantity);
    }
    return quantity;
  }, [useProductStock, effectiveCommercials, quantity]);

  const canUpdatePriceStock = useMemo(() => {
    const status = (publishStatus || "").toLowerCase();
    const statusOk = ["published", "sent", "processing", "ready", "failed"].includes(status);
    const hasBarcode = Boolean((barcode || "").trim());
    const wasPreviouslyPublished = Boolean(mappingPublishedAt);
    return hasBarcode && (statusOk || wasPreviouslyPublished);
  }, [publishStatus, barcode, mappingPublishedAt]);

  const canTrendyolContentPut = useMemo(() => {
    const status = (publishStatus || "").toLowerCase();
    const qty = Number(quantityInputValue);
    return (
      status === "published" &&
      Boolean((barcode || "").trim()) &&
      Number.isFinite(qty) &&
      qty > 0 &&
      Boolean(readiness?.ready)
    );
  }, [publishStatus, barcode, quantityInputValue, readiness?.ready]);

  const canTrendyolPlatformDelete = useMemo(() => {
    const status = (publishStatus || "").toLowerCase();
    return (
      Boolean((barcode || "").trim()) &&
      status !== "sent" &&
      status !== "processing"
    );
  }, [publishStatus, barcode]);

  async function handleTrendyolContentUpdate() {
    if (
      !confirm(
        "Yayındaki ürünün tam içeriği Trendyol'a PUT ile güncellenecek. Devam edilsin mi?"
      )
    ) {
      return;
    }
    setUpdatingContent(true);
    setPublishFlash(null);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/trendyol-content-update`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(data.missing) ? data.missing : [];
        setPublishFlash({
          type: "err",
          text:
            typeof data.error === "string"
              ? data.error
              : "İçerik güncellemesi başarısız.",
          missing: missing.length ? missing : undefined
        });
        await load(trendyolCategoryId);
        router.refresh();
        return;
      }
      setPublishFlash({
        type: "ok",
        text:
          typeof data.message === "string"
            ? data.message
            : "İçerik güncelleme Trendyol'a iletildi."
      });
      if (typeof data.batchRequestId === "string" && data.batchRequestId) {
        setBatchRequestId(data.batchRequestId);
      }
      if (typeof data.publishStatus === "string") {
        setPublishStatus(data.publishStatus);
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text: e instanceof Error ? e.message : "İstek başarısız."
      });
    } finally {
      setUpdatingContent(false);
    }
  }

  async function handleTrendyolPlatformDelete() {
    if (
      !confirm(
        "Trendyol'dan ürün silme talebi gönderilecek (batch). Yerel eşleştirme silinmez; batch sonucunu kontrol edin. Emin misiniz?"
      )
    ) {
      return;
    }
    setDeletingFromPlatform(true);
    setPublishFlash(null);
    setError(null);
    try {
      const res = await fetch(`/api/products/${productId}/trendyol-platform-delete`, {
        method: "POST"
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Silme isteği başarısız."
        );
      }
      setPublishFlash({
        type: "ok",
        text:
          typeof data.message === "string"
            ? data.message
            : "Silme isteği kuyruğa alındı."
      });
      if (typeof data.batchRequestId === "string" && data.batchRequestId) {
        setBatchRequestId(data.batchRequestId);
      }
      if (typeof data.publishStatus === "string") {
        setPublishStatus(data.publishStatus);
      }
      await load(trendyolCategoryId);
      router.refresh();
    } catch (e) {
      setPublishFlash({
        type: "err",
        text: e instanceof Error ? e.message : "Silme isteği başarısız."
      });
    } finally {
      setDeletingFromPlatform(false);
    }
  }

  if (loading) {
    return (
      <div className="card">
        <p className="text-sm text-slate-400">Trendyol eşleştirme yükleniyor…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Trendyol Eşleştirme
        </h2>
        <p className="text-xs text-slate-400">
          Ürünü Trendyol marka ve yaprak kategori ile eşleştirin. Kategori
          seçildiğinde özellikler Trendyol senkron verisinden yüklenir (
          <span className="text-indigo-400">Ayarlar → Kategorileri Çek</span> /{" "}
          <span className="text-indigo-400">özellik senkronu</span>).
        </p>

        {error && (
          <div className="rounded-lg border border-red-800 bg-red-900/30 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Trendyol gönderim
            </span>
            <span
              className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${trendyolPublishBadgeClass}`}
              title={`Trendyol publishStatus: ${publishStatus || "draft"}`}
            >
              {publishStatus || "draft"} · {trendyolPublishLabel}
            </span>
            {batchRequestId && (
              <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-slate-300">
                <span>
                  Batch:{" "}
                  <span className="text-indigo-300">{batchRequestId}</span>
                </span>
                <Link
                  href={`/trendyol/publish-jobs/${encodeURIComponent(batchRequestId)}`}
                  className="text-amber-400/90 hover:text-amber-300 no-underline"
                >
                  Sonucu kontrol →
                </Link>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PermissionGate permission="marketplace.publish">
              <button
                type="button"
                onClick={handleTrendyolPublish}
                disabled={publishing || !readiness?.ready}
                hidden={publishStatus === "archived"}
                className="btn-primary shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !readiness?.ready
                    ? "Önce yayına hazırlık kontrolündeki eksikleri tamamlayın"
                    : undefined
                }
              >
                {publishing ? "Gönderiliyor…" : "Trendyol'da Yayınla"}
              </button>
            </PermissionGate>
            <PermissionGate permission="pricing.update">
              <button
                type="button"
                onClick={handlePriceStockUpdate}
                disabled={updatingPriceStock || !canUpdatePriceStock}
                className="inline-flex items-center justify-center rounded-lg border border-emerald-700 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-emerald-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !canUpdatePriceStock
                    ? "Barkod ve uygun yayın durumu gereklidir."
                    : undefined
                }
              >
                {updatingPriceStock ? "Güncelleniyor…" : "Fiyat/Stok Güncelle"}
              </button>
            </PermissionGate>
            <PermissionGate permission="marketplace.publish">
              <button
                type="button"
                onClick={handleTrendyolContentUpdate}
                disabled={updatingContent || !canTrendyolContentPut}
                className="inline-flex items-center justify-center rounded-lg border border-sky-700 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-sky-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !canTrendyolContentPut
                    ? "Sadece yayında (published), stok > 0 ve hazırlık tamam ise PUT gönderilir."
                    : undefined
                }
              >
                {updatingContent ? "Gönderiliyor…" : "İçerik güncelle (PUT)"}
              </button>
            </PermissionGate>
            <PermissionGate permission="marketplace.unpublish">
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={unpublishing || publishStatus !== "published"}
                hidden={publishStatus === "archived"}
                className="inline-flex items-center justify-center rounded-lg border border-amber-700 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-900/30 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {unpublishing ? "Kaldırılıyor…" : "Yayından Kaldır"}
              </button>
            </PermissionGate>
            <PermissionGate permission="marketplace.publish">
              <button
                type="button"
                onClick={() => handleToggleArchive(publishStatus !== "archived")}
                disabled={archiving || publishStatus === "sent" || publishStatus === "processing"}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-900/40 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {archiving
                  ? publishStatus === "archived"
                    ? "Arşivden Çıkarılıyor…"
                    : "Arşivleniyor…"
                  : publishStatus === "archived"
                    ? "Arşivden Çıkar"
                    : "Arşivle"}
              </button>
            </PermissionGate>
            <PermissionGate permission="marketplace.publish">
              <button
                type="button"
                onClick={handleTrendyolPlatformDelete}
                disabled={deletingFromPlatform || !canTrendyolPlatformDelete}
                className="inline-flex items-center justify-center rounded-lg border border-red-800/80 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  !canTrendyolPlatformDelete
                    ? "Barkod gerekli; işlem sürüyorsa bekleyin."
                    : "Trendyol ürün silme API (DELETE + batch)"
                }
              >
                {deletingFromPlatform ? "Gönderiliyor…" : "Trendyol'dan sil"}
              </button>
            </PermissionGate>
          </div>
        </div>

        {publishFlash && (
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              publishFlash.type === "ok"
                ? "border-emerald-800 bg-emerald-900/25 text-emerald-100"
                : "border-red-800 bg-red-900/30 text-red-100"
            }`}
          >
            <p>{publishFlash.text}</p>
            {publishFlash.missing && publishFlash.missing.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs opacity-95">
                {publishFlash.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {lastErrorMessage && publishStatus.toLowerCase() === "failed" && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2 text-sm text-amber-100">
            <span className="font-medium">Son hata: </span>
            {lastErrorMessage}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <TrendyolBrandSearchSelect
            label="Trendyol Marka"
            value={trendyolBrandId}
            onChange={setTrendyolBrandId}
            selectedName={pickedBrandName}
            onPickName={setPickedBrandName}
            placeholder="Marka ara (en az 2 harf)…"
          />
          <SearchableSelect
            label="Trendyol Kategori (yaprak)"
            options={categories}
            value={trendyolCategoryId}
            onChange={handleCategoryChange}
            getId={(c) => c.categoryId}
            getLabel={(c) => `${c.name} (${c.categoryId})`}
            placeholder="Kategori ara…"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label">Barkod</label>
            <input
              className="input"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="8690123456789"
            />
          </div>
          <div>
            <label className="label">Satıcı Stok Kodu</label>
            <input
              className="input"
              value={stockCode}
              onChange={(e) => setStockCode(e.target.value)}
              placeholder="SKU / stok kodu"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Product Main ID</label>
            <input
              className="input"
              value={productMainId}
              onChange={(e) => setProductMainId(e.target.value)}
              placeholder="Trendyol ürün ana kimliği"
            />
          </div>
          <div>
            <label className="label">Desi</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={dimensionalWeight}
              onChange={(e) => setDimensionalWeight(e.target.value)}
            />
          </div>
          <div>
            <label className="label">KDV Oranı (%)</label>
            <input
              type="number"
              min={0}
              className="input"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Liste Fiyatı</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Satış Fiyatı</label>
            <input
              type="number"
              min={0}
              step={0.01}
              className="input"
              value={salePriceInputValue}
              onChange={(e) => setSalePrice(e.target.value)}
              disabled={useProductPrice}
            />
            {useProductPrice && (
              <p className="mt-1 text-xs text-slate-500">
                Ana ürün fiyatı kullanılacak.
              </p>
            )}
          </div>
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={useProductPrice}
                onChange={(e) => setUseProductPrice(e.target.checked)}
              />
              Ana ürün fiyatını kullan
            </label>
            <label className="inline-flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={useProductStock}
                onChange={(e) => setUseProductStock(e.target.checked)}
              />
              Ana ürün stoğunu kullan
            </label>
          </div>
          <div>
            <label className="label">Stok (adet)</label>
            <input
              type="number"
              min={0}
              step={1}
              className="input"
              value={quantityInputValue}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={useProductStock}
            />
            {useProductStock && (
              <p className="mt-1 text-xs text-slate-500">
                Ana ürün stoğu kullanılacak.
              </p>
            )}
          </div>
          <div>
            <label className="label">Para Birimi</label>
            <input
              className="input"
              value={currencyType}
              onChange={(e) => setCurrencyType(e.target.value.toUpperCase())}
              maxLength={8}
            />
          </div>
          <div>
            <label className="label">Kargo Firma ID</label>
            <input
              type="number"
              className="input"
              value={cargoCompanyId}
              onChange={(e) => setCargoCompanyId(e.target.value)}
              placeholder="Trendyol kargo firma ID (yayın için zorunlu)"
            />
          </div>
          <div>
            <label className="label">Yayın Durumu</label>
            <select
              className="input"
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value)}
            >
              <option value="draft">Taslak</option>
              <option value="ready">Hazır</option>
              <option value="processing">İşleniyor</option>
              <option value="sent">Trendyol&apos;a gönderildi</option>
              <option value="published">Yayında</option>
              <option value="failed">Başarısız</option>
              <option value="unpublished">Yayından Kaldırılmış</option>
              <option value="archived">Arşivlenmiş</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">Ana Görsel URL</label>
            <input
              className="input"
              value={mainImageUrl}
              onChange={(e) => setMainImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Ek Görseller (her satıra bir URL)</label>
            <textarea
              className="input min-h-[90px]"
              value={imageUrlsText}
              onChange={(e) => setImageUrlsText(e.target.value)}
              placeholder={"https://.../1.jpg\nhttps://.../2.jpg"}
            />
          </div>
        </div>

        {effectiveCommercials && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs text-slate-300">
            <div className="flex flex-wrap gap-4">
              <span>
                Barkod:{" "}
                <strong className="text-emerald-300">
                  {effectiveCommercials.barcode?.trim() || "—"}
                </strong>
              </span>
              <span>
                Ana fiyat (Product.price):{" "}
                <strong className="text-emerald-300">
                  ₺{(effectiveCommercials.productPrice ?? effectiveCommercials.salePrice).toLocaleString("tr-TR")}
                </strong>
              </span>
              <span>
                Trendyol override fiyatı:{" "}
                <strong className="text-emerald-300">
                  {effectiveCommercials.overrideSalePrice != null
                    ? `₺${effectiveCommercials.overrideSalePrice.toLocaleString("tr-TR")}`
                    : "—"}
                </strong>
              </span>
              <span>
                Kullanılan satış fiyatı:{" "}
                <strong className="text-emerald-300">
                  ₺{effectiveCommercials.salePrice.toLocaleString("tr-TR")}
                </strong>
              </span>
              <span>
                Kullanılan liste fiyatı:{" "}
                <strong className="text-emerald-300">
                  ₺{effectiveCommercials.listPrice.toLocaleString("tr-TR")}
                </strong>
              </span>
              <span className="text-slate-400">
                ({useProductPrice ? "Kaynak: Ana ürün fiyatı" : "Kaynak: Marketplace satış fiyatı"})
              </span>
              <span>
                Kullanılan stok:{" "}
                <strong className="text-emerald-300">
                  {effectiveCommercials.quantity}
                </strong>
              </span>
              <span className="text-slate-400">
                ({useProductStock ? "Kaynak: Ana ürün stoğu" : "Kaynak: Marketplace stoku"})
              </span>
            </div>
          </div>
        )}

        {trendyolCategoryId == null && (
          <p className="text-xs text-amber-500/90">
            Özellik alanlarını görmek için önce bir yaprak kategori seçin.
          </p>
        )}

        {categoryAttributes.length > 0 && (
          <div className="space-y-3 border-t border-slate-700 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Kategori özellikleri
            </h3>
            {categoryAttributes.map((ca) => {
              const st = attrState[ca.attributeId] ?? {
                valueId: null,
                custom: ""
              };
              return (
                <div
                  key={ca.attributeId}
                  className="rounded-lg border border-slate-700 bg-slate-900/40 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">
                      {ca.isRequired && (
                        <span className="text-red-400" title="Zorunlu">
                          *
                        </span>
                      )}{" "}
                      {ca.attributeName}
                    </span>
                    <span className="text-xs text-slate-500">
                      ID: {ca.attributeId}
                    </span>
                    {ca.isVariantable && (
                      <span className="rounded bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-medium text-violet-200">
                        Varyant
                      </span>
                    )}
                  </div>
                  {ca.values.length > 0 && (
                    <div className="mb-2">
                      <label className="text-xs text-slate-500">Önceden tanımlı değer</label>
                      <select
                        className="input mt-1 text-sm"
                        value={st.valueId ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAttrState((prev) => ({
                            ...prev,
                            [ca.attributeId]: {
                              valueId: v === "" ? null : parseInt(v, 10),
                              custom: prev[ca.attributeId]?.custom ?? ""
                            }
                          }));
                        }}
                      >
                        <option value="">— Seçin —</option>
                        {ca.values.map((v) => (
                          <option
                            key={v.attributeValueId}
                            value={v.attributeValueId}
                          >
                            {v.attributeValue}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {ca.allowCustom && (
                    <div>
                      <label className="text-xs text-slate-500">
                        Özel metin {ca.values.length > 0 ? "(allowCustom)" : ""}
                      </label>
                      <input
                        className="input mt-1 text-sm"
                        value={st.custom}
                        onChange={(e) =>
                          setAttrState((prev) => ({
                            ...prev,
                            [ca.attributeId]: {
                              valueId: prev[ca.attributeId]?.valueId ?? null,
                              custom: e.target.value
                            }
                          }))
                        }
                        placeholder="Serbest metin"
                      />
                    </div>
                  )}
                  {!ca.allowCustom && ca.values.length === 0 && (
                    <p className="text-xs text-slate-500">
                      Bu özellik için liste yok; Trendyol panelinden doğrulayın.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
        >
          {saving ? "Kaydediliyor…" : "Trendyol Eşleştirmesini Kaydet"}
        </button>
      </div>

      <div className="card space-y-3">
        <h2 className="text-sm font-semibold text-slate-100 border-b border-slate-700 pb-2">
          Yayına Hazırlık Kontrolü
        </h2>
        {readiness ? (
          <>
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                readiness.ready
                  ? "bg-emerald-900/50 text-emerald-300"
                  : "bg-amber-900/50 text-amber-200"
              }`}
            >
              {readiness.ready ? "Yayına hazır görünüyor" : "Eksikler var"}
            </div>
            {readiness.missing.length > 0 && (
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-300">
                {readiness.missing.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Kontrol yüklenemedi.</p>
        )}
      </div>
    </div>
  );
}
