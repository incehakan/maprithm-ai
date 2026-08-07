"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ClientPagePermissionGuard } from "@/components/auth/ClientPagePermissionGuard";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";

const STATUS_OPTIONS = [
  { value: "draft", label: "Taslak" },
  { value: "ready", label: "Hazır" },
  { value: "published", label: "Yayında" },
  { value: "unpublished", label: "Yayından Kaldırılmış" },
  { value: "archived", label: "Arşivlenmiş" }
];

function NewProductPageContent() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [sku, setSku] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<
    "draft" | "ready" | "published" | "unpublished" | "archived"
  >("draft");
  const [price, setPrice] = useState<number | "">("");
  const [stock, setStock] = useState<number | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Ürün adı zorunludur.");
      return;
    }

    const numericPrice = typeof price === "number" ? price : 0;
    const numericStock = typeof stock === "number" ? stock : 0;

    if (numericPrice < 0 || numericStock < 0) {
      setError("Fiyat ve stok 0 veya daha büyük olmalıdır.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: trimmedName,
          description,
          seoDescription,
          category: category || null,
          brand: brand || null,
          sku: sku || null,
          price: numericPrice,
          stock: numericStock,
          status,
          tags: tags || null
        })
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Ürün kaydedilemedi."));
      }

      router.push("/products");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ürün kaydedilirken bir hata oluştu."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Yeni ürün</h1>
        <p className="text-sm text-slate-400">
          Ürün bilgilerini doldurarak kataloğunuza ekleyin.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="card space-y-4 max-w-2xl"
        autoComplete="off"
      >
        <div>
          <label className="label" htmlFor="name">
            Ürün adı
          </label>
          <input
            id="name"
            className="input"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="category">
              Kategori
            </label>
            <input
              id="category"
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="brand">
              Marka
            </label>
            <input
              id="brand"
              className="input"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            />
          </div>
        </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="sku">
              SKU
            </label>
            <input
              id="sku"
              className="input"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="status">
              Durum
            </label>
            <select
              id="status"
              className="input"
              value={status}
              onChange={(e) =>
                setStatus(
                  e.target.value as
                    | "draft"
                    | "ready"
                    | "published"
                    | "unpublished"
                    | "archived"
                )
              }
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="description">
            Açıklama
          </label>
          <textarea
            id="description"
            className="input min-h-[80px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="seoDescription">
            SEO açıklaması
          </label>
          <textarea
            id="seoDescription"
            className="input min-h-[60px]"
            value={seoDescription}
            onChange={(e) => setSeoDescription(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="tags">
            Etiketler (virgülle ayırın)
          </label>
          <input
            id="tags"
            className="input"
            placeholder="kadın tişört, beyaz, pamuk"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="price">
              Fiyat (₺)
            </label>
            <input
              id="price"
              className="input"
              type="number"
              min={0}
              step="0.01"
              required
              value={price}
              onChange={(e) =>
                setPrice(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
          <div>
            <label className="label" htmlFor="stock">
              Stok adedi
            </label>
            <input
              id="stock"
              className="input"
              type="number"
              min={0}
              step="1"
              required
              value={stock}
              onChange={(e) =>
                setStock(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800"
            onClick={() => router.back()}
          >
            Vazgeç
          </button>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Kaydediliyor..." : "Kaydet"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewProductPage() {
  return (
    <ClientPagePermissionGuard permission="products.create">
      <NewProductPageContent />
    </ClientPagePermissionGuard>
  );
}
