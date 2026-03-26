import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

type Params = { params: { id: string } };

function getUserIdFromSession(session: { user?: { id?: string } | null } | null): string | null {
  return session?.user?.id ?? null;
}

export async function PUT(request: Request, { params }: Params) {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        feedUrl?: string;
        isActive?: boolean;
        syncIntervalMinutes?: number;
        deactivateMissingFromFeed?: boolean;
      }
    | null;

  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string") data.name = body.name.trim();
  if (typeof body?.feedUrl === "string") {
    const u = body.feedUrl.trim();
    try {
      new URL(u);
      data.feedUrl = u;
    } catch {
      return NextResponse.json(
        { success: false, message: "Geçerli bir feed URL girin." },
        { status: 400 }
      );
    }
  }
  if (typeof body?.isActive === "boolean") data.isActive = body.isActive;
  if (typeof body?.syncIntervalMinutes === "number") {
    data.syncIntervalMinutes = Math.max(1, Math.min(24 * 60, Math.round(body.syncIntervalMinutes)));
  }
  if (typeof body?.deactivateMissingFromFeed === "boolean") {
    data.deactivateMissingFromFeed = body.deactivateMissingFromFeed;
  }

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.xmlFeedSource ||
      typeof anyPrisma.xmlFeedSource.findFirst !== "function" ||
      typeof anyPrisma.xmlFeedSource.update !== "function"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "XML feed modeli Prisma client'ta bulunamadı.",
          error: "XmlFeedSource delegate missing. Prisma generate sonrası dev server'ı yeniden başlatın."
        },
        { status: 500 }
      );
    }
    const existing = await anyPrisma.xmlFeedSource.findFirst({
      where: { id: params.id, userId: ctx.userId, storeId: ctx.storeId }
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, message: "XML feed kaynağı bulunamadı." },
        { status: 404 }
      );
    }

    const updated = await anyPrisma.xmlFeedSource.update({
      where: { id: params.id },
      data: { ...data, storeId: ctx.storeId }
    });

    return NextResponse.json({
      success: true,
      message: "XML feed kaynağı güncellendi.",
      feed: updated
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Güncelleme başarısız.";
    return NextResponse.json(
      { success: false, message: "XML feed kaynağı güncellenemedi.", error: message },
      { status: 500 }
    );
  }
}
