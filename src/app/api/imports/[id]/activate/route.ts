import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";
import { secureImportJobUpdateMany } from "@/lib/security/storeScope";

type Params = { params: { id: string } };

export async function POST(_request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: unknown) {
    const msg =
      e instanceof Error && e.message === "NO_ACTIVE_STORE"
        ? "Aktif mağaza yok."
        : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  try {
    const job = await prisma.importJob.findFirst({
      where: {
        id: params.id,
        userId: ctx.userId,
        storeId: ctx.storeId,
        usageStatus: { not: "deleted" }
      },
      select: { id: true, originalFileName: true, usageStatus: true }
    });
    if (!job) {
      return NextResponse.json(
        { success: false, message: "İçe aktarma bulunamadı." },
        { status: 404 }
      );
    }

    const u = await secureImportJobUpdateMany(params.id, ctx.storeId, {
      usageStatus: "active"
    });
    if (u.count === 0) {
      return NextResponse.json(
        { success: false, message: "İçe aktarma bulunamadı." },
        { status: 404 }
      );
    }

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "IMPORT_ACTIVATED",
      entityType: "import_job",
      entityId: params.id,
      message: `Import aktifleştirildi: ${job.originalFileName}`
    });

    return NextResponse.json({
      success: true,
      message: "Import aktifleştirildi.",
      usageStatus: "active"
    });
  } catch (error) {
    console.error("[POST /api/imports/[id]/activate] response error:", error);
    return NextResponse.json(
      { success: false, message: "Import aktifleştirilemedi." },
      { status: 500 }
    );
  }
}
