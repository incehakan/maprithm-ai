import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrderSyncJobsHealthSnapshot } from "@/lib/trendyolOrderBackgroundSync";
import { logAndBuildApiError } from "@/lib/errorHandling";
import { getRequestId } from "@/lib/requestContext";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const [orderSync, xmlFeedStats, refSyncState] = await Promise.all([
      getOrderSyncJobsHealthSnapshot(),
      prisma.xmlFeedSource.aggregate({
        _count: { _all: true },
        where: { isActive: true }
      }),
      prisma.systemMarketplaceConnection.findUnique({
        where: { platform: "trendyol" },
        select: {
          lastSyncAt: true,
          lastSyncStatus: true,
          lastSyncMessage: true
        }
      })
    ]);

    const status =
      orderSync.stuckRunning > 0 || orderSync.failedLastHour > 10 ? "degraded" : "ok";

    return NextResponse.json({
      status,
      uptime: process.uptime(),
      jobs: {
        orderSync,
        activeXmlFeeds: xmlFeedStats._count._all,
        referenceSync: {
          lastSyncAt: refSyncState?.lastSyncAt?.toISOString() ?? null,
          lastSyncStatus: refSyncState?.lastSyncStatus ?? null,
          lastSyncMessage: refSyncState?.lastSyncMessage ?? null
        }
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV ?? "unknown",
      requestId
    });
  } catch (err) {
    const payload = logAndBuildApiError({
      err,
      fallbackMessage: "Jobs health check failed",
      requestId,
      context: { route: "/api/health/jobs" }
    });
    return NextResponse.json(
      {
        ...payload,
        status: "error",
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV ?? "unknown"
      },
      { status: 500 }
    );
  }
}

