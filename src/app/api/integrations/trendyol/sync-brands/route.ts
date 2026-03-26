import { NextResponse } from "next/server";
import { trendyolFetch } from "@/lib/trendyolFetch";
import { createActivityLog } from "@/lib/activityLog";
import { normalizeBrandData } from "@/lib/trendyolNormalize";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { prisma } from "@/lib/prisma";

type TrendyolBrandRaw = Record<string, unknown>;
type TrendyolBrandsResponse = { brands: TrendyolBrandRaw[] };

export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    let totalProcessed = 0;
    let page = 0;
    const pageSize = 2000;
    const now = new Date();

    while (true) {
      const result = await trendyolFetch<TrendyolBrandsResponse>(
        ctx.userId,
        ctx.storeId,
        `/integration/product/brands?page=${page}&size=${pageSize}`
      );

      if (!result.ok) {
        return NextResponse.json(
          { error: result.message || "Trendyol API hatası." },
          { status: result.status >= 400 ? result.status : 500 }
        );
      }

      const brands = result.data?.brands ?? [];
      if (brands.length === 0) break;

      for (const b of brands) {
        const normalized = normalizeBrandData(b);
        if (!normalized) continue;

        try {
          await prisma.trendyolBrand.upsert({
            where: { brandId: normalized.brandId },
            create: {
              brandId: normalized.brandId,
              name: normalized.name,
              isActive: normalized.isActive,
              rawData: normalized.rawData,
              lastSyncedAt: now
            },
            update: {
              name: normalized.name,
              isActive: normalized.isActive,
              rawData: normalized.rawData,
              lastSyncedAt: now
            }
          });
          totalProcessed++;
        } catch (e) {
          console.warn("Trendyol brand upsert error:", e);
        }
      }

      if (brands.length < pageSize) break;
      page++;
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_BRANDS_SYNCED",
      entityType: "TRENDYOL_SYNC",
      entityId: null,
      message: `Trendyol markaları senkronize edildi (${totalProcessed} adet)`
    });

    return NextResponse.json({
      success: true,
      count: totalProcessed,
      message: `${totalProcessed} marka senkronize edildi.`
    });
  } catch (error) {
    console.error("Trendyol sync-brands error:", error);
    const msg =
      error instanceof Error ? error.message : "Markalar çekilirken hata oluştu.";
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
