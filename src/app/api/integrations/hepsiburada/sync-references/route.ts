/**
 * POST /api/integrations/hepsiburada/sync-references
 *
 * Hepsiburada kategori/marka/özellik referans verisini generic tablolara yazar.
 * Sadece aktif mağaza bağlantısına sahip yetkili kullanıcılar çağırabilir.
 *
 * Body (opsiyonel):
 *   { brandNames?: string[] }   → senkronlanacak marka adları
 *   { categoryIds?: number[] }  → özellik sync yapılacak kategori ID'leri
 */

import { NextResponse } from "next/server";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import {
  syncHbCategories,
  syncHbBrands,
  syncHbCategoryAttributes,
} from "@/lib/hepsiburadaReferenceSync";

export async function POST(request: Request) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "settings.manage");
  } catch {
    return NextResponse.json({ success: false, error: "Erişim yok." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({})) as {
    brandNames?: string[];
    categoryIds?: number[];
    syncCategories?: boolean;
  };

  const results: Record<string, unknown> = {};

  try {
    // Kategoriler
    if (body.syncCategories !== false) {
      const cats = await syncHbCategories(ctx.storeId);
      results.categories = cats;
    }

    // Özellikler (verilen kategori ID'leri için)
    if (body.categoryIds?.length) {
      const attrResults: Record<string, unknown> = {};
      for (const catId of body.categoryIds) {
        const r = await syncHbCategoryAttributes(ctx.storeId, catId);
        attrResults[catId] = r;
      }
      results.attributes = attrResults;
    }

    // Markalar
    if (body.brandNames?.length) {
      const brands = await syncHbBrands(ctx.storeId, body.brandNames);
      results.brands = brands;
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Referans senkronu başarısız.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
