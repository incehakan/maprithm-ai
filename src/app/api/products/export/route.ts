import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";

const CSV_HEADERS = [
  "name",
  "description",
  "category",
  "brand",
  "sku",
  "price",
  "stock",
  "seoDescription",
  "tags",
  "status"
];

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session || !session.user) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids");

  const ids =
    idsParam && idsParam.trim().length > 0
      ? idsParam.split(",").map((id) => id.trim()).filter(Boolean)
      : null;

  const products = await prisma.product.findMany({
    where: {
      userId,
      ...(ids && ids.length > 0 ? { id: { in: ids } } : {})
    },
    orderBy: { createdAt: "desc" }
  });

  const rows: string[] = [];

  // header
  rows.push(CSV_HEADERS.join(","));

  for (const p of products) {
    const row = [
      toCsvValue(p.name),
      toCsvValue(p.description ?? ""),
      toCsvValue(p.category ?? ""),
      toCsvValue(p.brand ?? ""),
      toCsvValue(p.sku ?? ""),
      toCsvValue(p.price),
      toCsvValue(p.stock),
      toCsvValue(p.seoDescription ?? ""),
      toCsvValue(p.tags ?? ""),
      toCsvValue(p.status ?? "")
    ].join(",");

    rows.push(row);
  }

  const csv = rows.join("\r\n");

  // UTF-8 BOM for better Excel compatibility with Turkish characters
  const bom = "\uFEFF";
  const body = bom + csv;

  await createActivityLog({
    userId,
    action: "csv_export",
    entityType: "product",
    entityId: null,
    message: `Genel CSV dışa aktarma: ${products.length} ürün (${ids ? "seçili ürünler" : "tüm ürünler"}).`
  });

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="maprithm_products.csv"'
    }
  });
}

