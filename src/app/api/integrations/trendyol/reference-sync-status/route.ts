import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore } from "@/lib/requireActiveStore";

export async function GET() {
  try {
    await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const row = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" },
    select: {
      isActive: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      lastSyncMessage: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    status: row
      ? {
          isActive: row.isActive,
          lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: row.lastSyncStatus ?? null,
          lastSyncMessage: row.lastSyncMessage ?? null,
          updatedAt: row.updatedAt.toISOString()
        }
      : null
  });
}

