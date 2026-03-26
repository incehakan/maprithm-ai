"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";

const EXAMPLE_CSV = `name,description,category,brand,sku,price,stock,seoDescription,tags,status
"Örnek Ürün 1","Kısa açıklama",Giyim,MarkaA,SKU001,99.99,10,"SEO açıklaması","etiket1,etiket2",draft
"Örnek Ürün 2","Başka açıklama",Ayakkabı,MarkaB,SKU002,199.50,5,"SEO 2","etiket3",active`;

type ParsedRow = {
  name: string;
  description: string;
  category: string;
  brand: string;
  sku: string;
  price: string;
  stock: string;
  seoDescription: string;
  tags: string;
  status: string;
};

type RowResult =
  | { rowIndex: number; success: true; id: string; name: string }
  | { rowIndex: number; success: false; message: string };

type ImportResponse = {
  total: number;
  successCount: number;
  errorCount: number;
  results: RowResult[];
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSVForPreview(csv: string): ParsedRow[] {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push({
      name: row.name || "",
      description: row.description || "",
      category: row.category || "",
      brand: row.brand || "",
      sku: row.sku || "",
      price: row.price || "0",
      stock: row.stock || "0",
      seoDescription: row.seoDescription || "",
      tags: row.tags || "",
      status: row.status || "draft"
    });
  }
  return rows;
}

function ImportProductsPageContent() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvText, setCsvText] = useState("");
  const [previewRows, setPreviewRows] = useState<ParsedRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    setPreviewRows(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Lütfen .csv uzantılı bir dosya seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result?.toString() ?? "";
      setCsvText(text);
    };
    reader.onerror = () => setError("Dosya okunamadı.");
    reader.readAsText(file, "UTF-8");
  }

  function handlePreview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const trimmed = csvText.trim();
    if (!trimmed) {
      setError("CSV içeriği boş. Dosya yükleyin veya örnek formatı kopyalayıp yapıştırın.");
      return;
    }

    setLoading(true);

    try {
      const rows = parseCSVForPreview(trimmed);
      if (rows.length === 0) {
        setError("CSV'de veri satırı bulunamadı.");
        setLoading(false);
        return;
      }
      setPreviewRows(rows);
    } catch (err) {
      setError("CSV formatı geçersiz.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!previewRows || previewRows.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ csv: csvText.trim() })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "İçe aktarma başarısız.");
      }

      setResult(data as ImportResponse);
      setPreviewRows(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "İçe aktarma sırasında bir hata oluştu."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setCsvText("");
    setPreviewRows(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const successResults = result?.results.filter((r) => r.success) ?? [];
  const errorResults = result?.results.filter((r) => !r.success) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/products"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          Ürünler
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-sm font-medium text-slate-200">CSV İçe Aktar</span>
      </div>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          CSV ile Toplu Ürün İçe Aktar
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          CSV dosyanızı yükleyin veya içeriği yapıştırın. Önizleme yaptıktan sonra kaydedin.
        </p>
      </div>

      {!previewRows && !result && (
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="label">CSV dosyası</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-slate-200"
              />
            </div>

            <div>
              <label className="label">veya CSV içeriği</label>
              <textarea
                className="input min-h-[160px] font-mono text-xs"
                placeholder="Örnek formatı aşağıdan kopyalayabilirsiniz..."
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  setError(null);
                }}
              />
            </div>

            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
              <div className="mb-2 text-xs font-medium text-slate-400">
                Örnek CSV formatı (ilk satır başlık)
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-slate-300">
                {EXAMPLE_CSV}
              </pre>
            </div>

            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !csvText.trim()}
            >
              {loading ? "Okunuyor..." : "Önizle"}
            </button>
          </div>
        </form>
      )}

      {previewRows && !result && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Önizleme ({previewRows.length} ürün)
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800"
              >
                Geri Dön
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? "Kaydediliyor..." : `${previewRows.length} Ürünü Kaydet`}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-800/80 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Ürün Adı</th>
                  <th className="px-3 py-2 text-left">Kategori</th>
                  <th className="px-3 py-2 text-left">Marka</th>
                  <th className="px-3 py-2 text-right">Fiyat</th>
                  <th className="px-3 py-2 text-right">Stok</th>
                  <th className="px-3 py-2 text-left">Durum</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, idx) => (
                  <tr
                    key={idx}
                    className="border-t border-slate-700 hover:bg-slate-800/50"
                  >
                    <td className="px-3 py-2 text-slate-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-slate-100 font-medium">
                      {row.name || <span className="text-red-400">Boş!</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{row.category || "-"}</td>
                    <td className="px-3 py-2 text-slate-300">{row.brand || "-"}</td>
                    <td className="px-3 py-2 text-right text-slate-100">
                      ₺{row.price}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-100">
                      {row.stock}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          row.status === "active"
                            ? "bg-emerald-600 text-white"
                            : row.status === "passive"
                              ? "bg-amber-600 text-white"
                              : "bg-slate-600 text-white"
                        }`}
                      >
                        {row.status === "active"
                          ? "Aktif"
                          : row.status === "passive"
                            ? "Pasif"
                            : "Taslak"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-400">
            Yukarıdaki veriler doğru görünüyorsa "Kaydet" butonuna basarak veritabanına aktarın.
          </p>
        </div>
      )}

      {result && (
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">İçe aktarma özeti</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-xs text-slate-400">İşlenen</div>
              <div className="text-xl font-semibold text-slate-100">
                {result.total}
              </div>
            </div>
            <div className="rounded-lg bg-emerald-900/30 p-3">
              <div className="text-xs text-emerald-300/80">Başarılı</div>
              <div className="text-xl font-semibold text-emerald-300">
                {result.successCount}
              </div>
            </div>
            <div className="rounded-lg bg-red-900/30 p-3">
              <div className="text-xs text-red-300/80">Hatalı</div>
              <div className="text-xl font-semibold text-red-300">
                {result.errorCount}
              </div>
            </div>
          </div>

          {successResults.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-400">
                Başarılı kayıtlar
              </div>
              <ul className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-700 bg-slate-900/50 p-2 text-sm text-slate-200">
                {successResults.map((r) =>
                  r.success ? (
                    <li key={`${r.rowIndex}-${r.id}`}>
                      Satır {r.rowIndex}: {r.name}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}

          {errorResults.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-medium text-slate-400">
                Hatalı satırlar
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-slate-700 bg-slate-900/50 p-2 text-sm">
                {errorResults.map((r) =>
                  !r.success ? (
                    <li
                      key={r.rowIndex}
                      className="text-red-300"
                    >
                      Satır {r.rowIndex}: {r.message}
                    </li>
                  ) : null
                )}
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            >
              Yeni içe aktarma
            </button>
            <Link href="/products" className="btn-primary inline-flex items-center px-4 py-2">
              Ürün listesine git
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImportProductsPage() {
  return (
    <ClientPagePermissionGuard permission="products.create">
      <ImportProductsPageContent />
    </ClientPagePermissionGuard>
  );
}
