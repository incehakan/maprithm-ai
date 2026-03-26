import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { DEMO_PRODUCTS } from "@/lib/demoData";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";

export async function POST() {
  try {
    let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
      return NextResponse.json({ error: msg }, { status: 401 });
    }

    // Mevcut demo verileri kontrol et
    const existingDemoCount = await prisma.product.count({
      where: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        isDemo: true
      }
    });

    if (existingDemoCount > 0) {
      return NextResponse.json(
        { error: `Zaten ${existingDemoCount} adet demo ürününüz var. Önce mevcut demo verileri temizleyin.` },
        { status: 400 }
      );
    }

    // Demo ürünleri oluştur
    const createdProducts = await prisma.product.createMany({
      data: DEMO_PRODUCTS.map((product) => ({
        userId: ctx.userId,
        storeId: ctx.storeId,
        name: product.name,
        description: product.description,
        price: product.price,
        stock: product.stock,
        category: product.category,
        brand: product.brand,
        sku: product.sku,
        status: product.status,
        seoDescription: product.seoDescription,
        tags: product.tags,
        costPrice: product.costPrice,
        commissionRate: product.commissionRate,
        cargoCost: product.cargoCost,
        vatRate: product.vatRate,
        targetProfitRate: product.targetProfitRate,
        isDemo: true
      }))
    });

    // Activity log
    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "demo_data_loaded",
      entityType: "demo",
      entityId: null,
      message: `${createdProducts.count} adet demo ürünü yüklendi`
    });

    return NextResponse.json({
      success: true,
      count: createdProducts.count,
      message: `${createdProducts.count} adet demo ürünü başarıyla yüklendi`
    });
  } catch (error) {
    console.error("Demo veri yükleme hatası:", error);
    return NextResponse.json(
      { error: "Demo verileri yüklenirken bir hata oluştu" },
      { status: 500 }
    );
  }
}
