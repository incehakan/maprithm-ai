import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { syncGlobalTrendyolReferenceData } from "@/lib/trendyolReferenceSync";

export async function GET() {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const [conn, logs] = await Promise.all([
    prisma.systemMarketplaceConnection.findUnique({
      where: { platform: "trendyol" },
      select: {
        isActive: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncMessage: true
      }
    }),
    prisma.systemReferenceSyncLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  return NextResponse.json({
    status: conn
      ? {
          isActive: conn.isActive,
          lastSyncAt: conn.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: conn.lastSyncStatus ?? null,
          lastSyncMessage: conn.lastSyncMessage ?? null
        }
      : null,
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      status: l.status,
      message: l.message,
      summary: l.summary,
      createdAt: l.createdAt.toISOString()
    }))
  });
}

export async function POST() {
  let admin: Awaited<ReturnType<typeof requireSystemAdmin>>;
  try {
    admin = await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  try {
    const result = await syncGlobalTrendyolReferenceData({
      triggeredByUserId: admin.userId
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Global sync hatası";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

