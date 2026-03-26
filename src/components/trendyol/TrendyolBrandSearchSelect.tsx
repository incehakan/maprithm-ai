"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TrendyolBrandSearchRow = {
  brandId: number;
  name: string;
  isActive?: boolean | null;
};

function formatBrandLabel(b: TrendyolBrandSearchRow): string {
  if (b.isActive === false) {
    return `${b.name} (Trendyol'da pasif)`;
  }
  return b.name;
}

type Props = {
  label: string;
  value: number | null;
  onChange: (id: number | null) => void;
  /** Seçili markanın adı (API’den gelen öneri / mapping; arama sonuçlarında yokken gösterim için) */
  selectedName: string | null;
  /** Listeden seçim veya temizlemede güncel isim (kayıt sonrası etiket için) */
  onPickName?: (name: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * Debounced GET /api/trendyol/brands/search — tüm katalogda arama (ilk 8000 marka limiti yok).
 */
export function TrendyolBrandSearchSelect({
  label,
  value,
  onChange,
  selectedName,
  onPickName,
  placeholder = "Marka ara (en az 2 harf)…",
  disabled
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [remote, setRemote] = useState<TrendyolBrandSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const displayClosed = useMemo(() => {
    if (value == null) return "";
    const hit = remote.find((b) => b.brandId === value);
    if (hit) return formatBrandLabel(hit);
    if (selectedName?.trim()) return selectedName.trim();
    return `Marka #${value}`;
  }, [value, remote, selectedName]);

  const runSearch = useCallback(async (query: string) => {
    const t = query.trim();
    if (t.length < 2) {
      setRemote([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/trendyol/brands/search?q=${encodeURIComponent(t)}&limit=60`
      );
      const data = (await res.json()) as { brands?: TrendyolBrandSearchRow[] };
      if (!res.ok) {
        setRemote([]);
        return;
      }
      setRemote(data.brands ?? []);
    } catch {
      setRemote([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const t = q.trim();
    if (t.length < 2) {
      setRemote([]);
      return;
    }
    timerRef.current = setTimeout(() => {
      void runSearch(t);
    }, 280);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q, open, runSearch]);

  const list = useMemo(() => {
    const out = [...remote];
    if (value != null && selectedName?.trim()) {
      const exists = out.some((b) => b.brandId === value);
      if (!exists) {
        out.unshift({
          brandId: value,
          name: selectedName.trim(),
          isActive: null
        });
      }
    }
    return out;
  }, [remote, value, selectedName]);

  return (
    <div className="relative">
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type="text"
          className="input"
          disabled={disabled}
          placeholder={placeholder}
          value={open ? q : displayClosed}
          onChange={(e) => {
            setQ(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQ(displayClosed || "");
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
                  onPickName?.(null);
                  setQ("");
                  setRemote([]);
                  setOpen(false);
                }}
              >
                — Seçimi temizle —
              </button>
            </li>
            {q.trim().length < 2 && (
              <li className="px-3 py-2 text-xs text-slate-500">
                En az 2 karakter yazın; tüm Trendyol marka tablosunda aranır.
              </li>
            )}
            {loading && q.trim().length >= 2 && (
              <li className="px-3 py-2 text-xs text-slate-500">Aranıyor…</li>
            )}
            {!loading &&
              q.trim().length >= 2 &&
              list.length === 0 &&
              value == null && (
                <li className="px-3 py-2 text-xs text-amber-200/80">
                  Sonuç yok. Yazımı kontrol edin veya marka senkronunu çalıştırın.
                </li>
              )}
            {list.map((o) => (
              <li key={o.brandId}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left text-slate-200 hover:bg-slate-800"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.brandId);
                    onPickName?.(o.name);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  {formatBrandLabel(o)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
