"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  HepsiburadaCategoryPicker,
  type HbAttributeField,
} from "@/components/hepsiburada/HepsiburadaCategoryPicker";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { extractApiErrorMessage } from "@/lib/apiErrorMessage";
import { formatHbPrice } from "@/lib/hepsiburadaProductFormat";

type Props = {
  merchantId: string;
};

export function HepsiburadaProductImportForm({ merchantId }: Props) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<HbAttributeField[]>([]);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});

  const [merchantSku, setMerchantSku] = useState("");
  const [varyantGroupId, setVaryantGroupId] = useState("");
  const [urunAdi, setUrunAdi] = useState("");
  const [urunAciklamasi, setUrunAciklamasi] = useState("");
  const [barcode, setBarcode] = useState("");
  const [marka, setMarka] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [image1, setImage1] = useState("");
  const [video1, setVideo1] = useState("");

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const missingRequired = useMemo(() => {
    return attrs.filter((a) => a.required && !String(attrValues[a.id] ?? "").trim());
  }, [attrs, attrValues]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    setTrackingId(null);

    if (!categoryId) {
      setMessage({ type: "error", text: "Kategori seçin." });
      return;
    }
    if (missingRequired.length) {
      setMessage({
        type: "error",
        text: `Zorunlu alanlar: ${missingRequired.map((a) => a.name).join(", ")}`,
      });
      return;
    }

    let priceStr: string | undefined;
    if (price.trim()) {
      const n = Number(price.replace(",", "."));
      if (!Number.isFinite(n)) {
        setMessage({ type: "error", text: "Fiyat geçersiz." });
        return;
      }
      try {
        priceStr = formatHbPrice(n);
      } catch {
        setMessage({ type: "error", text: "Fiyat formatlanamadı." });
        return;
      }
    }

    const attributes: Record<string, string | string[]> = {};
    for (const a of attrs) {
      const v = attrValues[a.id]?.trim();
      if (!v) continue;
      attributes[a.name] = v;
      attributes[`attribute-${a.id}`] = v;
    }

    const item = {
      categoryId: Number(categoryId),
      merchant: merchantId,
      attributes,
      merchantSku,
      VaryantGroupID: varyantGroupId || merchantSku,
      UrunAdi: urunAdi,
      UrunAciklamasi: urunAciklamasi,
      Barcode: barcode,
      Marka: marka,
      ...(priceStr ? { price: priceStr } : {}),
      ...(stock.trim() ? { stock: stock.trim() } : {}),
      ...(image1.trim() ? { Image1: image1.trim() } : {}),
      ...(video1.trim() ? { Video1: video1.trim() } : {}),
    };

    setSaving(true);
    try {
      const res = await fetch("/api/integrations/hepsiburada/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [item] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(extractApiErrorMessage(data, "Import başarısız."));
      }
      const tid =
        data?.data?.data?.trackingId ||
        data?.data?.trackingId ||
        null;
      setTrackingId(typeof tid === "string" ? tid : null);
      setMessage({
        type: "success",
        text: tid
          ? `Gönderildi. trackingId: ${tid}`
          : "Gönderildi (trackingId yanıtta yok).",
      });
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Import hatası.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message ? (
        <Alert variant={message.type === "success" ? "success" : "error"}>
          {message.text}
        </Alert>
      ) : null}
      {trackingId ? (
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() =>
            router.push(
              `/hepsiburada/products/tracking?trackingId=${encodeURIComponent(trackingId)}`
            )
          }
        >
          Durumu Takip Et →
        </button>
      ) : null}

      <Card className="space-y-4">
        <HepsiburadaCategoryPicker
          value={categoryId}
          onChange={(id) => {
            setCategoryId(id);
            setAttrValues({});
          }}
          onAttributesLoaded={setAttrs}
          disabled={saving}
        />

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="label">merchantSku</label>
            <Input
              value={merchantSku}
              onChange={(e) => setMerchantSku(e.target.value)}
              required
              placeholder="BÜYÜKHARF, boşluksuz"
            />
          </div>
          <div>
            <label className="label">VaryantGroupID</label>
            <Input
              value={varyantGroupId}
              onChange={(e) => setVaryantGroupId(e.target.value)}
              placeholder="Boşsa merchantSku kullanılır"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Ürün Adı</label>
            <Input value={urunAdi} onChange={(e) => setUrunAdi(e.target.value)} required />
          </div>
          <div className="md:col-span-2">
            <label className="label">Ürün Açıklaması</label>
            <textarea
              className="input min-h-[100px]"
              value={urunAciklamasi}
              onChange={(e) => setUrunAciklamasi(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Barkod (EAN13)</label>
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} required />
          </div>
          <div>
            <label className="label">Marka</label>
            <Input value={marka} onChange={(e) => setMarka(e.target.value)} required />
          </div>
          <div>
            <label className="label">Fiyat (TL, nokta ondalık)</label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="14.50 → 14,50"
            />
          </div>
          <div>
            <label className="label">Stok</label>
            <Input value={stock} onChange={(e) => setStock(e.target.value)} />
          </div>
          <div>
            <label className="label">Image1 URL</label>
            <Input value={image1} onChange={(e) => setImage1(e.target.value)} />
          </div>
          <div>
            <label className="label">Video1 (mp4 URL)</label>
            <Input value={video1} onChange={(e) => setVideo1(e.target.value)} />
          </div>
        </div>
      </Card>

      {attrs.length > 0 ? (
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Kategori özellikleri</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {attrs.map((a) => (
              <div key={a.id}>
                <label className="label">
                  {a.name}
                  {a.required ? " *" : ""}
                  <span className="ml-1 text-[10px] text-slate-500">{a.type}</span>
                </label>
                {a.values && a.values.length > 0 ? (
                  <select
                    className="input"
                    value={attrValues[a.id] ?? ""}
                    onChange={(e) =>
                      setAttrValues((prev) => ({ ...prev, [a.id]: e.target.value }))
                    }
                    required={a.required}
                  >
                    <option value="">Seçin…</option>
                    {a.values.map((v) => (
                      <option key={v.id} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    value={attrValues[a.id] ?? ""}
                    onChange={(e) =>
                      setAttrValues((prev) => ({ ...prev, [a.id]: e.target.value }))
                    }
                    required={a.required}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <button type="submit" className="btn-primary" disabled={saving || !merchantId}>
        {saving ? "Gönderiliyor…" : "Hepsiburada’ya İçe Aktar"}
      </button>
      {!merchantId ? (
        <p className="text-xs text-amber-200">
          Önce Ayarlar → Hepsiburada bağlantısında merchantId kaydedin.
        </p>
      ) : null}
    </form>
  );
}
