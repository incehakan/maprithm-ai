import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { getUserSettings, type UserSettingsData } from "@/lib/userSettings";
import type { Product } from "@prisma/client";
import { requireActiveStore } from "@/lib/requireActiveStore";

const TRENDYOL_HEADERS = [
  "UrunAdi",
  "Aciklama",
  "Marka",
  "Kategori",
  "SaticiStokKodu",
  "Barkod",
  "SatisFiyati",
  "ListeFiyati",
  "Stok",
  "KdvOrani",
  "Desi",
  "ParaBirimi",
  "Durum",
  "Gorsel1",
  "SeoAciklamasi",
  "Etiketler"
];

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

function mapProductToTrendyolRow(p: Product, settings: UserSettingsData): string[] {
  const fallbackBrand = settings.fallbackBrand || "Belirtilmedi";
  const fallbackCategory = settings.fallbackCategory || "Belirtilmedi";

  const brand = p.brand && p.brand.trim().length > 0 ? p.brand : fallbackBrand;
  const category =
    p.category && p.category.trim().length > 0 ? p.category : fallbackCategory;

  const baseSku =
    p.sku && p.sku.trim().length > 0 ? p.sku.trim() : `MAPRITHM-${p.id}`;

  const description =
    p.description && p.description.trim().length > 0
      ? p.description
      : p.name;

  const price =
    p.price !== null && typeof p.price !== "undefined"
      ? Number(p.price)
      : 0;

  const stock =
    p.stock !== null && typeof p.stock !== "undefined" ? p.stock : 0;

  const rawStatus = (p.status ?? "").toLowerCase();
  const statusTr =
    rawStatus === "active"
      ? "Aktif"
      : rawStatus === "passive"
        ? "Pasif"
        : "Taslak";

  const kdvOrani = settings.defaultVatRate ?? 20;
  const desi = settings.defaultDesi ?? 1;
  const paraBirimi = settings.defaultCurrency ?? "TRY";
  const gorsel1 = "";
  const seoAciklamasi = p.seoDescription ?? "";
  const etiketler = p.tags ?? "";

  return [
    p.name,
    description,
    brand,
    category,
    baseSku,
    baseSku,
    price.toString(),
    price.toString(),
    stock.toString(),
    kdvOrani.toString(),
    desi.toString(),
    paraBirimi,
    statusTr,
    gorsel1,
    seoAciklamasi,
    etiketler
  ];
}

export async function GET(req: NextRequest) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");

  const ids =
    idsParam && idsParam.trim().length > 0
      ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : null;

  const products = await prisma.product.findMany({
    where: {
      userId: ctx.userId,
      storeId: ctx.storeId,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  const userSettings = await getUserSettings({ userId: ctx.userId, storeId: ctx.storeId });

  const rows: string[] = [];
  rows.push(TRENDYOL_HEADERS.join(","));

  for (const p of products) {
    const mapped = mapProductToTrendyolRow(p, userSettings).map(toCsvValue).join(",");
    rows.push(mapped);
  }

  const csv = rows.join("\r\n");
  const bom = "\uFEFF";
  const body = bom + csv;

  await createActivityLog({
    userId: ctx.userId,
    storeId: ctx.storeId,
    membershipId: ctx.membershipId,
    action: "trendyol_export",
    entityType: "product",
    entityId: null,
    message: `Trendyol CSV dışa aktarma: ${products.length} ürün (${ids ? "seçili ürünler" : "tüm ürünler"}).`
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="trendyol_products_professional.csv"'
    }
  });
}

