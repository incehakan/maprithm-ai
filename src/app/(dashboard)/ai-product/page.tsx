"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";

type AiProductResult = {
  title: string;
  description: string;
  seoDescription: string;
  tags: string[];
};

function AiProductPageContent() {
  const router = useRouter();

  const [input, setInput] = useState("");
  const [result, setResult] = useState<AiProductResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    const trimmed = input.trim();
    if (!trimmed) {
      setError("Lütfen ürün fikrini yazın.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/ai/generate-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ input: trimmed })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "İçerik oluşturulamadı.");
      }

      setResult({
        title: data.title,
        description: data.description,
        seoDescription: data.seoDescription,
        tags: Array.isArray(data.tags) ? data.tags : []
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "İçerik oluşturulurken bir hata oluştu."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToProduct() {
    if (!result) return;

    setSaving(true);
    setSaveError(null);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: result.title,
          description: result.description,
          seoDescription: result.seoDescription,
          category: null,
          brand: null,
          sku: null,
          price: 0,
          stock: 0,
          status: "draft",
          tags: result.tags.join(", ")
        })
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Ürün kaydedilemedi.");
      }

      // Basit toast
      alert("Ürün başarıyla oluşturuldu.");
      router.push("/products");
    } catch (err) {
      setSaveError(
        err instanceof Error
          ? err.message
          : "Ürün oluşturulurken bir hata oluştu."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          AI Ürün Oluştur
        </h1>
        <p className="text-sm text-slate-400">
          Ürün fikrini kısaca yaz, Türkiye e-ticaret pazaryerlerine uygun başlık,
          açıklama, SEO açıklaması ve etiketler AI tarafından oluşturulsun.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label" htmlFor="idea">
            Ürün fikri
          </label>
          <textarea
            id="idea"
            className="input min-h-[120px]"
            placeholder="Örn: kadın beyaz oversize pamuk tişört, günlük kullanım, yazlık..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Oluşturuluyor..." : "Oluştur"}
        </button>
      </form>

      {result && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">
              Önerilen ürün içeriği
            </h2>
            <button
              type="button"
              onClick={handleSaveToProduct}
              className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
              disabled={saving}
            >
              {saving ? "Kaydediliyor..." : "Ürüne kaydet"}
            </button>
          </div>

          {saveError && (
            <p className="text-sm text-red-400" role="alert">
              {saveError}
            </p>
          )}

          <div>
            <div className="text-xs font-medium text-slate-400">Başlık</div>
            <div className="mt-1 text-sm font-semibold text-slate-100">
              {result.title}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400">Açıklama</div>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-200">
              {result.description}
            </p>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400">
              SEO Açıklaması
            </div>
            <p className="mt-1 text-sm text-slate-300">
              {result.seoDescription}
            </p>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400">Etiketler</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {result.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiProductPage() {
  return (
    <ClientPagePermissionGuard permission="products.create">
      <AiProductPageContent />
    </ClientPagePermissionGuard>
  );
}
