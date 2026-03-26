import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";

type RowResult = { rowIndex: number; success: true; id: string; name: string };
type RowError = { rowIndex: number; success: false; message: string };

/** Basit CSV parse: ilk satır başlık, virgül/çift tırnak destekli. */
function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

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

function parseNum(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function parseStock(value: unknown): number | null {
  const n = parseNum(value);
  if (n === null) return null;
  const int = Math.floor(n);
  return int < 0 ? null : int;
}

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const userExists = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { id: true }
  });

  if (!userExists) {
    return NextResponse.json(
      { error: "Oturum geçersiz. Lütfen çıkış yapıp tekrar giriş yapın." },
      { status: 401 }
    );
  }

  try {
    const { csv } = await request.json();
    if (typeof csv !== "string" || !csv.trim()) {
      return NextResponse.json(
        { error: "CSV içeriği gönderilmedi." },
        { status: 400 }
      );
    }

    let rows: Record<string, string>[];
    try {
      rows = parseCSV(csv.trim());
    } catch (parseError) {
      console.error(parseError);
      return NextResponse.json(
        { error: "CSV formatı geçersiz." },
        { status: 400 }
      );
    }

    const results: (RowResult | RowError)[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowIndex = i + 2;

      const name = row.name != null ? String(row.name).trim() : "";
      if (!name) {
        results.push({
          rowIndex,
          success: false,
          message: "Ürün adı (name) zorunludur."
        });
        errorCount++;
        continue;
      }

      const price = parseNum(row.price);
      if (price === null || price < 0) {
        results.push({
          rowIndex,
          success: false,
          message: "Fiyat (price) geçerli bir sayı olmalıdır (0 veya büyük)."
        });
        errorCount++;
        continue;
      }

      const stock = parseStock(row.stock);
      if (stock === null) {
        results.push({
          rowIndex,
          success: false,
          message: "Stok (stock) geçerli bir tam sayı olmalıdır (0 veya büyük)."
        });
        errorCount++;
        continue;
      }

      const status = (row.status && String(row.status).trim()) || "draft";
      const validStatus = ["draft", "active", "passive"].includes(status)
        ? status
        : "draft";

      try {
        const product = await prisma.product.create({
          data: {
            userId: ctx.userId,
            storeId: ctx.storeId,
            name,
            description: row.description ? String(row.description).trim() : null,
            category: row.category ? String(row.category).trim() : null,
            brand: row.brand ? String(row.brand).trim() : null,
            sku: row.sku ? String(row.sku).trim() : null,
            price,
            stock,
            seoDescription: row.seoDescription
              ? String(row.seoDescription).trim()
              : null,
            tags: row.tags ? String(row.tags).trim() : null,
            status: validStatus
          }
        });
        results.push({
          rowIndex,
          success: true,
          id: product.id,
          name: product.name
        });
        successCount++;
      } catch (err) {
        console.error("Import row error:", err);
        results.push({
          rowIndex,
          success: false,
          message:
            err instanceof Error ? err.message : "Kayıt eklenirken hata oluştu."
        });
        errorCount++;
      }
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "csv_import",
      entityType: "product",
      entityId: null,
      message: `CSV içe aktarma tamamlandı: ${successCount} başarı, ${errorCount} hata (toplam ${rows.length}).`
    });

    return NextResponse.json({
      total: rows.length,
      successCount,
      errorCount,
      results
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      { error: "İçe aktarma işlenirken bir hata oluştu." },
      { status: 500 }
    );
  }
}
