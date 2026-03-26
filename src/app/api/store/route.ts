import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, error: msg }, { status: 401 });
  }

  const [store, totalUsers, activeUsers, totalProducts, totalImports, totalXmlFeeds] =
    await Promise.all([
      prisma.store.findUnique({
        where: { id: ctx.storeId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          plan: true,
          timezone: true,
          currency: true,
          locale: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.storeMembership.count({ where: { storeId: ctx.storeId } }),
      prisma.storeMembership.count({ where: { storeId: ctx.storeId, isActive: true } }),
      prisma.product.count({ where: { storeId: ctx.storeId } }),
      prisma.importJob.count({
        where: { storeId: ctx.storeId, usageStatus: { not: "deleted" } }
      }),
      prisma.xmlFeedSource.count({ where: { storeId: ctx.storeId } })
    ]);

  if (!store) {
    return NextResponse.json(
      { success: false, error: "Mağaza bulunamadı." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    store,
    stats: {
      totalUsers,
      activeUsers,
      totalProducts,
      totalImports,
      totalXmlFeeds
    }
  });
}

