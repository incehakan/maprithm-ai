import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore } from "@/lib/requireActiveStore";

function getUserIdFromSession(session: { user?: { id?: string } | null } | null): string | null {
  return session?.user?.id ?? null;
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ success: false, message: msg }, { status: 401 });
  }

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.xmlFeedSource ||
      typeof anyPrisma.xmlFeedSource.findMany !== "function"
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
    const feeds = await anyPrisma.xmlFeedSource.findMany({
      where: { userId: ctx.userId, storeId: ctx.storeId },
      orderBy: { createdAt: "desc" }
    });
    return NextResponse.json({
      success: true,
      message: "XML feed listesi getirildi.",
      feeds
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Liste alınamadı.";
    return NextResponse.json(
      { success: false, message: "XML feed listesi alınamadı.", error: message },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
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

  const name = body?.name?.trim() ?? "";
  const feedUrl = body?.feedUrl?.trim() ?? "";
  const syncIntervalMinutes = Math.max(
    1,
    Math.min(24 * 60, Math.round(Number(body?.syncIntervalMinutes ?? 60)))
  );
  const isActive = body?.isActive !== false;
  const deactivateMissingFromFeed = body?.deactivateMissingFromFeed === true;

  if (!name || !feedUrl) {
    return NextResponse.json(
      { success: false, message: "name ve feedUrl zorunludur." },
      { status: 400 }
    );
  }

  try {
    new URL(feedUrl);
  } catch {
    return NextResponse.json(
      { success: false, message: "Geçerli bir feed URL girin." },
      { status: 400 }
    );
  }

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.xmlFeedSource ||
      typeof anyPrisma.xmlFeedSource.create !== "function"
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
    const created = await anyPrisma.xmlFeedSource.create({
      data: {
        userId: ctx.userId,
        storeId: ctx.storeId,
        name,
        feedUrl,
        isActive,
        syncIntervalMinutes,
        deactivateMissingFromFeed
      }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "XML_FEED_CREATED",
      entityType: "xml_feed_source",
      entityId: created.id,
      message: `XML feed kaynağı oluşturuldu: ${name}`
    });

    return NextResponse.json({
      success: true,
      message: "XML feed kaynağı oluşturuldu.",
      feed: created
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kayıt başarısız.";
    return NextResponse.json(
      { success: false, message: "XML feed kaydı oluşturulamadı.", error: message },
      { status: 500 }
    );
  }
}
