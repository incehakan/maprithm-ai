"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

export type HbCategoryOption = {
  id: string;
  name: string;
  leaf?: boolean;
  paths?: string;
};

export type HbAttributeField = {
  id: string;
  name: string;
  required: boolean;
  type: string;
  multiValue?: boolean;
  values?: Array<{ id: string; name: string }>;
};

type Props = {
  value: string | null;
  onChange: (categoryId: string | null, meta?: HbCategoryOption | null) => void;
  onAttributesLoaded?: (attrs: HbAttributeField[]) => void;
  disabled?: boolean;
};

/**
 * Debounced kategori arama + seçim; seçilince attributes (+ enum values) yükler.
 */
export function HepsiburadaCategoryPicker({
  value,
  onChange,
  onAttributesLoaded,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [all, setAll] = useState<HbCategoryOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [attrsLoading, setAttrsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const selected = useMemo(
    () => all.find((c) => c.id === value) ?? null,
    [all, value]
  );

  const loadCategories = useCallback(async () => {
    if (loadedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations/hepsiburada/categories");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Kategoriler alınamadı."));
      }
      const rows = Array.isArray(data?.data) ? data.data : [];
      setAll(
        rows.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? r.categoryId ?? ""),
          name: String(r.name ?? ""),
          leaf: Boolean(r.leaf),
          paths: typeof r.paths === "string" ? r.paths : undefined,
        }))
      );
      loadedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kategori hatası.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return all.slice(0, 80);
    return all
      .filter(
        (c) =>
          c.name.toLocaleLowerCase("tr-TR").includes(needle) ||
          (c.paths ?? "").toLocaleLowerCase("tr-TR").includes(needle)
      )
      .slice(0, 80);
  }, [all, q]);

  async function selectCategory(opt: HbCategoryOption) {
    onChange(opt.id, opt);
    setOpen(false);
    setQ("");
    setAttrsLoading(true);
    try {
      const res = await fetch(
        `/api/integrations/hepsiburada/categories/${encodeURIComponent(opt.id)}/attributes`
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Özellikler alınamadı."));
      }
      const rawAttrs = Array.isArray(data?.data) ? data.data : [];
      const attrs: HbAttributeField[] = [];

      for (const a of rawAttrs) {
        const id = String(a.id ?? "");
        const type = String(a.type ?? "String");
        let values: Array<{ id: string; name: string }> | undefined;
        if (type.toLowerCase() === "enum" && id) {
          const vr = await fetch(
            `/api/integrations/hepsiburada/categories/${encodeURIComponent(opt.id)}/attributes/${encodeURIComponent(id)}/values`
          );
          const vd = await vr.json().catch(() => null);
          if (vr.ok && Array.isArray(vd?.data)) {
            values = vd.data.map((v: Record<string, unknown>) => ({
              id: String(v.id ?? ""),
              name: String(v.name ?? v.value ?? ""),
            }));
          }
        }
        attrs.push({
          id,
          name: String(a.name ?? ""),
          required: Boolean(a.required ?? a.mandatory),
          type,
          multiValue: Boolean(a.multiValue),
          values,
        });
      }
      onAttributesLoaded?.(attrs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Özellik yükleme hatası.");
      onAttributesLoaded?.([]);
    } finally {
      setAttrsLoading(false);
    }
  }

  return (
    <div className="relative space-y-1">
      <label className="label">Kategori</label>
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((o) => !o)}
        className="input flex w-full items-center justify-between text-left"
      >
        <span className={selected ? "text-slate-100" : "text-slate-500"}>
          {selected
            ? selected.paths
              ? `${selected.name} — ${selected.paths}`
              : selected.name
            : loading
              ? "Kategoriler yükleniyor…"
              : "Kategori seçin"}
        </span>
        <span className="text-slate-500">▾</span>
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 w-full rounded-xl border border-white/15 bg-slate-900 p-2 shadow-xl">
          <input
            className="input mb-2"
            placeholder="Kategori ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <ul className="max-h-56 overflow-auto text-sm">
            {filtered.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-2 text-left hover:bg-indigo-500/20"
                  onClick={() => void selectCategory(c)}
                >
                  <div className="text-slate-100">{c.name}</div>
                  {c.paths ? (
                    <div className="truncate text-[11px] text-slate-500">{c.paths}</div>
                  ) : null}
                </button>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-2 py-3 text-xs text-slate-500">Sonuç yok.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {attrsLoading ? (
        <p className="text-xs text-slate-400">Özellikler yükleniyor…</p>
      ) : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
