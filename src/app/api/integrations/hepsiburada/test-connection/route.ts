import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hbFetch } from "@/lib/hepsiburadaFetch";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { jsonError } from "@/lib/errors/errorResponse";

export async function POST() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const noStore = e?.message === "NO_ACTIVE_STORE";
    return noStore
      ? jsonError("NO_ACTIVE_STORE", { httpStatus: 401 })
      : jsonError("UNAUTHORIZED", { httpStatus: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch (e: any) {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const row = await prisma.marketplaceConnection.findFirst({
      where: { storeId: ctx.storeId, platform: "hepsiburada" }
    });

    if (!row) {
      return jsonError("NOT_FOUND", {
        internalMessage: "No Hepsiburada connection found",
        httpStatus: 404
      });
    }

    if (!row.isActive) {
      return NextResponse.json(
        { success: false, error: "Bağlantı pasif. Önce aktif hale getirin." },
        { status: 400 }
      );
    }

    // Hafif bir OMS çağrısı ile kimlik bilgilerini doğrula (1 kayıt iste, yeterli).
    const result = await hbFetch<unknown>(
      ctx.storeId,
      "OMS",
      `/packages/merchantid/${encodeURIComponent(row.sellerId)}/packages?offset=0&limit=1`
    );

    if (result.ok) {
      await prisma.marketplaceConnection.updateMany({
        where: { id: row.id, storeId: ctx.storeId },
        data: { lastTestAt: new Date() }
      });
      return NextResponse.json({ success: true, message: "Bağlantı başarılı." });
    }

    return NextResponse.json(
      { success: false, error: result.message, status: result.status },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Hepsiburada test connection error:", error);
    return jsonError("INTERNAL_ERROR", {
      internalMessage: error.message,
      httpStatus: 500
    });
  }
}
