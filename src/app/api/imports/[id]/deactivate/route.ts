import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { createActivityLog } from "@/lib/activityLog";

type Params = { params: { id: string } };

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const session = await auth();
    const userId = getUserIdFromSession(session);
    if (!userId) {
      return NextResponse.json(
        { success: false, message: "Yetkisiz." },
        { status: 401 }
      );
    }

    const anyPrisma = prisma as any;
    const job = await anyPrisma.importJob.findFirst({
      where: { id: params.id, userId, usageStatus: { not: "deleted" } },
      select: { id: true, originalFileName: true, usageStatus: true }
    });
    if (!job) {
      return NextResponse.json(
        { success: false, message: "İçe aktarma bulunamadı." },
        { status: 404 }
      );
    }

    await anyPrisma.importJob.update({
      where: { id: params.id },
      data: { usageStatus: "passive" }
    });

    await createActivityLog({
      userId,
      action: "IMPORT_DEACTIVATED",
      entityType: "import_job",
      entityId: params.id,
      message: `Import pasife alındı: ${job.originalFileName}`
    });

    return NextResponse.json({
      success: true,
      message: "Import pasife alındı.",
      usageStatus: "passive"
    });
  } catch (error) {
    console.error("[POST /api/imports/[id]/deactivate] response error:", error);
    return NextResponse.json(
      { success: false, message: "Import pasife alınamadı." },
      { status: 500 }
    );
  }
}
