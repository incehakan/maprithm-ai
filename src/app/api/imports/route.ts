import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

export async function GET() {
  try {
    let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
      return NextResponse.json({ success: false, message: msg }, { status: 401 });
    }

    const anyPrisma = prisma as any;
    const jobs = await anyPrisma.importJob.findMany({
      where: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        usageStatus: { not: "deleted" }
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        sourceType: true,
        originalFileName: true,
        status: true,
        usageStatus: true,
        totalRows: true,
        successRows: true,
        failedRows: true,
        overrideBrandName: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return NextResponse.json({
      success: true,
      message: "Import listesi getirildi.",
      jobs
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Bilinmeyen sunucu hatası";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("GET /api/imports failed", error);
    console.error("GET /api/imports failed stack", errorStack);
    return NextResponse.json(
      {
        success: false,
        message: "Import listesi alınamadı",
        error: errorMessage
      },
      { status: 500 }
    );
  }
}
