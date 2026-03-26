"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ProductHealthResult,
  HealthSummary,
  HealthIssue
} from "@/lib/productHealth";
import {
  getHealthScoreColor,
  getHealthScoreLabel
} from "@/lib/productHealth";

type Props = {
  healthResults: ProductHealthResult[];
  summary: HealthSummary;
};

type FilterType =
  | "all"
  | "seo"
  | "price"
  | "stock"
  | "category"
  | "draft"
  | "critical";

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "critical", label: "Kritik Sorunlu" },
  { value: "seo", label: "Eksik SEO" },
  { value: "price", label: "Eksik Fiyat" },
  { value: "stock", label: "Eksik Stok" },
  { value: "category", label: "Eksik Kategori" },
  { value: "draft", label: "Taslak Ürünler" }
];

function SeverityBadge({ severity }: { severity: HealthIssue["severity"] }) {
  const colors = {
    critical: "bg-red-600 text-white",
    warning: "bg-amber-500 text-white",
    info: "bg-slate-600 text-slate-200"
  };

  const labels = {
    critical: "Kritik",
    warning: "Uyarı",
    info: "Bilgi"
  };

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${colors[severity]}`}
    >
      {labels[severity]}
    </span>
  );
}

function HealthScoreBadge({ score }: { score: number }) {
  const color = getHealthScoreColor(score);
  const label = getHealthScoreLabel(score);

  return (
    <div className="flex items-center gap-2">
      <div
        className={`inline-flex items-center justify-center rounded-full ${color} w-10 h-10 text-sm font-bold text-white`}
      >
        {score}
      </div>
      <span className="text-xs text-slate-400">{label}</span>
    </div>
  );
}

export function ProductHealthClient({ healthResults, summary }: Props) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const filteredResults = healthResults.filter((r) => {
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!r.productName.toLowerCase().includes(term)) {
        return false;
      }
    }

    switch (filter) {
      case "critical":
        return r.hasCriticalIssues;
      case "seo":
        return r.issues.some((i) => i.field === "seoDescription");
      case "price":
        return r.issues.some((i) => i.field === "price");
      case "stock":
        return r.issues.some((i) => i.field === "stock");
      case "category":
        return r.issues.some((i) => i.field === "category");
      case "draft":
        return r.status === "draft";
      default:
        return true;
    }
  });

  const sortedResults = [...filteredResults].sort(
    (a, b) => a.healthScore - b.healthScore
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Ürün Sağlık Kontrolü
          </h1>
          <p className="text-sm text-slate-400">
            Ürünlerinizdeki eksik ve sorunlu alanları kontrol edin.
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
        >
          Ürün Listesi
        </Link>
      </div>

      {/* Özet Kartlar */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="card">
          <div className="text-xs text-slate-400">Toplam Ürün</div>
          <div className="mt-1 text-2xl font-semibold text-slate-100">
            {summary.totalProducts}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Sorunlu Ürün</div>
          <div className="mt-1 text-2xl font-semibold text-red-400">
            {summary.totalWithIssues}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Ortalama Skor</div>
          <div className="mt-1 text-2xl font-semibold text-slate-100">
            {summary.averageHealthScore}
            <span className="text-sm text-slate-500">/100</span>
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Eksik SEO</div>
          <div className="mt-1 text-2xl font-semibold text-amber-400">
            {summary.missingSeo}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Eksik Fiyat</div>
          <div className="mt-1 text-2xl font-semibold text-red-400">
            {summary.missingPrice}
          </div>
        </div>
        <div className="card">
          <div className="text-xs text-slate-400">Taslak</div>
          <div className="mt-1 text-2xl font-semibold text-slate-400">
            {summary.draftProducts}
          </div>
        </div>
      </div>

      {/* Detaylı Özet */}
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-100 mb-3">
          Eksik Alan Özeti
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-400">Eksik Kategori:</span>
            <span className="text-slate-100">{summary.missingCategory}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Eksik Marka:</span>
            <span className="text-slate-100">{summary.missingBrand}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Eksik SKU:</span>
            <span className="text-slate-100">{summary.missingSku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Eksik Stok:</span>
            <span className="text-slate-100">{summary.missingStock}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Kısa Açıklama:</span>
            <span className="text-slate-100">{summary.missingDescription}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Eksik Etiket:</span>
            <span className="text-slate-100">{summary.missingTags}</span>
          </div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Ürün ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input w-64 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === opt.value
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {sortedResults.length} ürün gösteriliyor
        </span>
      </div>

      {/* Ürün Listesi */}
      {sortedResults.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-slate-400">
            {filter === "all"
              ? "Henüz ürün eklenmemiş."
              : "Bu filtreye uygun ürün bulunamadı."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedResults.map((result) => (
            <div
              key={result.productId}
              className={`card flex flex-col md:flex-row md:items-center gap-4 ${
                result.hasCriticalIssues
                  ? "border-red-800/50"
                  : result.issueCount > 0
                    ? "border-amber-800/30"
                    : "border-emerald-800/30"
              }`}
            >
              {/* Skor */}
              <div className="flex-shrink-0">
                <HealthScoreBadge score={result.healthScore} />
              </div>

              {/* Ürün Bilgisi */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/products/${result.productId}`}
                    className="font-medium text-slate-100 hover:text-indigo-400 truncate"
                  >
                    {result.productName}
                  </Link>
                  {result.status === "draft" && (
                    <span className="inline-flex items-center rounded bg-slate-700 px-1.5 py-0.5 text-[10px] text-slate-300">
                      Taslak
                    </span>
                  )}
                  {result.status === "active" && (
                    <span className="inline-flex items-center rounded bg-emerald-700 px-1.5 py-0.5 text-[10px] text-white">
                      Aktif
                    </span>
                  )}
                </div>

                {/* Sorunlar */}
                {result.issues.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {result.issues.map((issue, idx) => (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
                          issue.severity === "critical"
                            ? "bg-red-900/40 text-red-300"
                            : issue.severity === "warning"
                              ? "bg-amber-900/40 text-amber-300"
                              : "bg-slate-800 text-slate-400"
                        }`}
                        title={issue.message}
                      >
                        {issue.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-emerald-400 mt-1">
                    Tüm alanlar tamamlanmış
                  </p>
                )}
              </div>

              {/* Aksiyonlar */}
              <div className="flex gap-2 flex-shrink-0">
                <Link
                  href={`/products/${result.productId}`}
                  className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded border border-slate-700 hover:bg-slate-800"
                >
                  Detay
                </Link>
                <Link
                  href={`/products/${result.productId}/edit`}
                  className="text-xs text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded border border-indigo-700 hover:bg-indigo-900/30"
                >
                  Düzenle
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
