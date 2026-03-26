import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";

export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user || !(session.user as any).id) {
      return NextResponse.json(
        { error: "Oturum geçersiz" },
        { status: 401 }
      );
    }

    const userId = (session.user as any).id as string;

    // Demo ürün sayısını kontrol et
    const demoCount = await prisma.product.count({
      where: {
        userId,
        isDemo: true
      }
    });

    if (demoCount === 0) {
      return NextResponse.json(
        { error: "Silinecek demo ürünü bulunamadı" },
        { status: 404 }
      );
    }

    // Demo ürünleri sil
    const deleted = await prisma.product.deleteMany({
      where: {
        userId,
        isDemo: true
      }
    });

    // Activity log
    await createActivityLog({
      userId,
      action: "demo_data_cleared",
      entityType: "demo",
      entityId: null,
      message: `${deleted.count} adet demo ürünü silindi`
    });

    return NextResponse.json({
      success: true,
      count: deleted.count,
      message: `${deleted.count} adet demo ürünü başarıyla silindi`
    });
  } catch (error) {
    console.error("Demo veri silme hatası:", error);
    return NextResponse.json(
      { error: "Demo verileri silinirken bir hata oluştu" },
      { status: 500 }
    );
  }
}
