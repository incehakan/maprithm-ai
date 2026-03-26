"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
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

type SuggestedAttr = {
  id: string;
  attributeId: number;
  attributeName: string;
  attributeValueId: number | null;
  attributeValue: string | null;
  customValue: string | null;
  isRequired: boolean;
};

type MissingItem = {
  attributeId: number;
  attributeName: string;
  isRequired: true;
  reason: string;
};

type SuggestionPayload = {
  id: string;
  suggestedBrandId: number | null;
  suggestedBrandName: string | null;
  suggestedCategoryId: number | null;
  suggestedCategoryName: string | null;
  confidenceScore: number | null;
  confidenceBand: "high" | "medium" | "low";
  aiReasoningSummary: string | null;
  missingRequiredList: MissingItem[];
  missingRequiredCount: number;
  status: string;
  suggestedAttributes: SuggestedAttr[];
};

type ImportRowPayload = {
  rowIndex: number;
  rawData: unknown;
  normalizedName: string | null;
  normalizedDescription: string | null;
  normalizedBrand: string | null;
  normalizedCategoryText: string | null;
  normalizedSku: string | null;
  normalizedBarcode: string | null;
  price: number | null;
  stock: number | null;
  status: string;
  errorMessage: string | null;
};

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

function confidenceBadgeClass(band: string): string {
  if (band === "high")
    return "bg-emerald-900/40 text-emerald-300 border-emerald-700/30";
  if (band === "medium")
    return "bg-amber-900/40 text-amber-200 border-amber-700/30";
  return "bg-red-900/35 text-red-200 border-red-800/30";
}

function confidenceLabel(band: string): string {
  if (band === "high") return "Yüksek";
  if (band === "medium") return "Orta";
  return "Düşük";
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "approved")
    return "bg-emerald-900/50 text-emerald-200 border-emerald-700/40";
  if (s === "rejected") return "bg-red-900/50 text-red-200 border-red-800/40";
  if (s === "applied") return "bg-violet-900/50 text-violet-200 border-violet-700/40";
  if (s === "suggested")
    return "bg-amber-900/50 text-amber-100 border-amber-700/40";
  return "bg-slate-800 text-slate-300 border-slate-600";
}

function mergeAttrState(
  defs: CatAttr[],
  previous: Record<number, { valueId: number | null; custom: string }>,
  originals: SuggestedAttr[]
): Record<number, { valueId: number | null; custom: string }> {
  const next: Record<number, { valueId: number | null; custom: string }> = {};
  for (const def of defs) {
    const p = previous[def.attributeId];
    if (p !== undefined) {
      next[def.attributeId] = { ...p };
      continue;
    }
    const orig = originals.find((a) => a.attributeId === def.attributeId);
    if (orig) {
      next[def.attributeId] = {
        valueId: orig.attributeValueId,
        custom: orig.customValue?.trim() ? orig.customValue : ""
      };
    } else {
      next[def.attributeId] = { valueId: null, custom: "" };
    }
  }
  return next;
}

function ImportTrendyolSuggestionDetailPageContent() {
  const params = useParams();
  const jobId = typeof params?.id === "string" ? params.id : "";
  const suggestionId =
    typeof params?.suggestionId === "string" ? params.suggestionId : "";

  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [suggestion, setSuggestion] = useState<SuggestionPayload | null>(null);
  const [importRow, setImportRow] = useState<ImportRowPayload | null>(null);
  const [pickedBrandName, setPickedBrandName] = useState<string | null>(null);
  const [categories, setCategories] = useState<CatOpt[]>([]);
  const [categoryAttributes, setCategoryAttributes] = useState<CatAttr[]>([]);
  const [effectiveCategoryId, setEffectiveCategoryId] = useState<number | null>(
    null
  );
  const [previewActive, setPreviewActive] = useState(false);

  const [brandId, setBrandId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const originalSuggestedRef = useRef<SuggestedAttr[]>([]);
  const [attrState, setAttrState] = useState<
    Record<number, { valueId: number | null; custom: string }>
  >({});

  const load = useCallback(
    async (previewCategoryId?: number | null) => {
      if (!jobId || !suggestionId) return;
      const isPreview =
        previewCategoryId != null &&
        Number.isFinite(previewCategoryId) &&
        previewCategoryId > 0;
      const qs = isPreview ? `?previewCategoryId=${previewCategoryId}` : "";
      if (isPreview) setPreviewLoading(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/imports/${jobId}/trendyol-suggestions/${suggestionId}${qs}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || "Yüklenemedi.");
        }
        setSuggestion(data.suggestion);
        setImportRow(data.importRow);
        setCategories(data.categories ?? []);
        setCategoryAttributes(data.categoryAttributes ?? []);
        setEffectiveCategoryId(data.effectiveCategoryId ?? null);
        setPreviewActive(Boolean(data.previewCategoryActive));

        if (!isPreview) {
          originalSuggestedRef.current = data.suggestion?.suggestedAttributes ?? [];
          setBrandId(data.suggestion?.suggestedBrandId ?? null);
          setPickedBrandName(
            data.suggestion?.suggestedBrandName?.trim() || null
          );
          setCategoryId(
            data.suggestion?.suggestedCategoryId ??
              data.effectiveCategoryId ??
              null
          );
          setAttrState(
            mergeAttrState(
              data.categoryAttributes ?? [],
              {},
              originalSuggestedRef.current
            )
          );
        } else {
          setAttrState((prev) =>
            mergeAttrState(
              data.categoryAttributes ?? [],
              prev,
              originalSuggestedRef.current
            )
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata");
      } finally {
        if (isPreview) setPreviewLoading(false);
        else setLoading(false);
      }
    },
    [jobId, suggestionId]
  );

  useEffect(() => {
    load(null);
  }, [load]);

  const onCategoryPicked = useCallback(
    (cid: number | null) => {
      setCategoryId(cid);
      if (cid != null && cid > 0) {
        // Kayıtlı kategoriyle aynıysa önizleme query’si kullanma
        if (suggestion?.suggestedCategoryId === cid) {
          load(null);
        } else {
          load(cid);
        }
      } else {
        setCategoryAttributes([]);
        setEffectiveCategoryId(null);
        setPreviewActive(false);
        setAttrState({});
      }
    },
    [load, suggestion?.suggestedCategoryId]
  );

  const buildAttributesPayload = useCallback(() => {
    return categoryAttributes.map((def) => {
      const st = attrState[def.attributeId] ?? {
        valueId: null,
        custom: ""
      };
      return {
        attributeId: def.attributeId,
        attributeName: def.attributeName,
        attributeValueId: st.custom.trim() ? null : st.valueId,
        customValue: st.custom.trim() ? st.custom.trim() : null
      };
    });
  }, [categoryAttributes, attrState]);

  const save = async (status: "suggested" | "approved" | "rejected") => {
    if (!jobId || !suggestionId) return;
    setSaving(true);
    setFlash(null);
    setError(null);
    try {
      const attributes =
        categoryId != null && categoryId > 0 ? buildAttributesPayload() : [];
      const payload: Record<string, unknown> = {
        suggestedBrandId: brandId,
        suggestedCategoryId: categoryId,
        status
      };
      if (categoryId != null && categoryId > 0) {
        payload.attributes = attributes;
      }

      const res = await fetch(
        `/api/imports/${jobId}/trendyol-suggestions/${suggestionId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Kaydedilemedi.");
      }
      await load(null);
      setFlash(
        status === "approved"
          ? "Öneri onaylandı ve kaydedildi."
          : status === "rejected"
            ? "Öneri reddedildi."
            : "Taslak olarak kaydedildi."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kayıt hatası");
    } finally {
      setSaving(false);
    }
  };

  const rawJson = useMemo(() => {
    try {
      return JSON.stringify(importRow?.rawData ?? {}, null, 2);
    } catch {
      return String(importRow?.rawData);
    }
  }, [importRow?.rawData]);

  if (!jobId || !suggestionId) {
    return (
      <p className="text-sm text-slate-400">Geçersiz adres.</p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={`/imports/${jobId}/trendyol-suggestions`}
          className="text-sm text-indigo-400 hover:text-indigo-300"
        >
          ← Trendyol önerileri
        </Link>
        <Link
          href={`/imports/${jobId}`}
          className="text-sm text-slate-500 hover:text-slate-300"
        >
          İçe aktarma detayı
        </Link>
        <button
          type="button"
          onClick={() => load(null)}
          className="text-sm text-slate-500 hover:text-slate-300"
        >
          Yenile
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Yükleniyor…</p>
      ) : error && !suggestion ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : suggestion && importRow ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-100">
                Trendyol önerisi — Satır {importRow.rowIndex}
              </h1>
              <p className="text-sm text-slate-400">
                Öneri kimliği:{" "}
                <code className="text-indigo-400">{suggestionId}</code>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(suggestion.status)}`}
              >
                {suggestion.status}
              </span>
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${confidenceBadgeClass(suggestion.confidenceBand)}`}
              >
                {suggestion.confidenceScore != null
                  ? `${Math.round(suggestion.confidenceScore)} · `
                  : ""}
                {confidenceLabel(suggestion.confidenceBand)}
              </span>
            </div>
          </div>

          {flash && (
            <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
              {flash}
            </p>
          )}
          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Import satırı
              </h2>
              <div>
                <h3 className="text-xs font-medium text-slate-500">
                  Ham veri (rawData)
                </h3>
                <pre className="mt-1 max-h-56 overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                  {rawJson}
                </pre>
              </div>
              <dl className="grid gap-2 text-sm text-slate-300">
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Ad</dt>
                  <dd className="col-span-2">{importRow.normalizedName ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Açıklama</dt>
                  <dd className="col-span-2 text-slate-400">
                    {importRow.normalizedDescription ?? "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Marka (normalize)</dt>
                  <dd className="col-span-2">{importRow.normalizedBrand ?? "—"}</dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Kategori metni</dt>
                  <dd className="col-span-2">
                    {importRow.normalizedCategoryText ?? "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">SKU / Barkod</dt>
                  <dd className="col-span-2 font-mono text-xs">
                    {importRow.normalizedSku ?? "—"} /{" "}
                    {importRow.normalizedBarcode ?? "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Fiyat / Stok</dt>
                  <dd className="col-span-2">
                    {importRow.price ?? "—"} / {importRow.stock ?? "—"}
                  </dd>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <dt className="text-slate-500">Satır durumu</dt>
                  <dd className="col-span-2">{importRow.status}</dd>
                </div>
              </dl>
            </div>

            <div className="card space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                AI özeti
              </h2>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">
                {suggestion.aiReasoningSummary ?? "—"}
              </p>
              <div>
                <h3 className="text-xs font-medium text-slate-500">
                  Eksik zorunlu özellikler
                </h3>
                {suggestion.missingRequiredList.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Yok</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {suggestion.missingRequiredList.map((m) => (
                      <li
                        key={m.attributeId}
                        className="rounded-lg border border-amber-900/50 bg-amber-950/25 px-3 py-2 text-sm text-amber-100"
                      >
                        <span className="font-medium">{m.attributeName}</span>
                        <span className="text-amber-200/80"> ({m.attributeId})</span>
                        <p className="text-xs text-amber-200/70">{m.reason}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="card space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-100">
                Düzenleme
              </h2>
              {previewLoading && (
                <span className="text-xs text-sky-400">Kategori özellikleri yükleniyor…</span>
              )}
              {previewActive && (
                <span className="rounded-full border border-sky-700/50 bg-sky-950/40 px-2 py-0.5 text-xs text-sky-200">
                  Önizleme: #{effectiveCategoryId} — Kaydet ile kalıcı olur
                </span>
              )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <TrendyolBrandSearchSelect
                label="Trendyol markası"
                value={brandId}
                onChange={setBrandId}
                selectedName={pickedBrandName}
                onPickName={setPickedBrandName}
                placeholder="Marka ara (en az 2 harf)…"
                disabled={saving}
              />
              <SearchableSelect
                label="Trendyol kategorisi (yaprak)"
                options={categories}
                value={categoryId}
                onChange={onCategoryPicked}
                getId={(c) => c.categoryId}
                getLabel={(c) => c.name}
                placeholder="Kategori ara…"
                disabled={saving || previewLoading}
              />
            </div>

            {categoryId == null ? (
              <p className="text-sm text-slate-500">
                Kategori seçilmediğinde özellik satırları listelenmez; kayıtta mevcut
                özellikler temizlenir.
              </p>
            ) : categoryAttributes.length === 0 ? (
              <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-100">
                Bu kategori için <strong>TrendyolCategoryAttribute</strong> kaydı yok.
                Entegrasyon ekranından kategori özellik senkronu çalıştırın.
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Özellikler
                </h3>
                <div className="space-y-4">
                  {categoryAttributes.map((def) => {
                    const st = attrState[def.attributeId] ?? {
                      valueId: null,
                      custom: ""
                    };
                    return (
                      <div
                        key={def.attributeId}
                        className="rounded-lg border border-slate-800 bg-slate-900/40 p-3"
                      >
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          {def.isRequired && (
                            <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-200">
                              Zorunlu
                            </span>
                          )}
                          {def.isVariantable && (
                            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                              Varyant
                            </span>
                          )}
                          <span className="text-sm font-medium text-slate-200">
                            {def.attributeName}
                          </span>
                          <span className="text-xs text-slate-500">
                            ({def.attributeId})
                          </span>
                        </div>
                        {def.values.length > 0 ? (
                          <select
                            className="input mb-2"
                            disabled={saving}
                            value={
                              st.custom.trim()
                                ? ""
                                : st.valueId != null
                                  ? String(st.valueId)
                                  : ""
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setAttrState((prev) => ({
                                ...prev,
                                [def.attributeId]: {
                                  valueId: v ? parseInt(v, 10) : null,
                                  custom: v ? "" : prev[def.attributeId]?.custom ?? ""
                                }
                              }));
                            }}
                          >
                            <option value="">— Değer seçin —</option>
                            {def.values.map((v) => (
                              <option
                                key={v.attributeValueId}
                                value={v.attributeValueId}
                              >
                                {v.attributeValue}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="mb-2 text-xs text-slate-500">
                            Önceden tanımlı değer listesi yok.
                          </p>
                        )}
                        {def.allowCustom && (
                          <div>
                            <label className="text-xs text-slate-500">
                              Özel metin {def.allowCustom ? "" : ""}
                            </label>
                            <input
                              type="text"
                              className="input mt-1"
                              disabled={saving}
                              placeholder="Listede yoksa metin girin"
                              value={st.custom}
                              onChange={(e) =>
                                setAttrState((prev) => ({
                                  ...prev,
                                  [def.attributeId]: {
                                    valueId: e.target.value
                                      ? null
                                      : prev[def.attributeId]?.valueId ?? null,
                                    custom: e.target.value
                                  }
                                }))
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                disabled={saving}
                onClick={() => save("approved")}
                className="btn-primary text-sm disabled:opacity-50"
              >
                Kaydet ve onayla
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save("rejected")}
                className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-2 text-sm text-red-100 hover:bg-red-950/60 disabled:opacity-50"
              >
                Kaydet ve reddet
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => save("suggested")}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                Sadece kaydet (taslak)
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function ImportTrendyolSuggestionDetailPage() {
  return (
    <ClientPagePermissionGuard permission="imports.manage">
      <ImportTrendyolSuggestionDetailPageContent />
    </ClientPagePermissionGuard>
  );
}
