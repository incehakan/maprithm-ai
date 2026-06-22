import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";
import { validateRuntimeConfig } from "@/lib/runtimeConfig";
import { getOrderSyncJobsHealthSnapshot } from "@/lib/trendyolOrderBackgroundSync";
import { FEATURE_FLAGS, isFeatureEnabled } from "@/lib/featureFlags";

export const dynamic = "force-dynamic";

const V2_PUBLISH_ACTIONS = [
  "TRENDYOL_PUBLISH_BATCH_STARTED",
  "TRENDYOL_PUBLISH_ITEM_SUCCEEDED",
  "TRENDYOL_PUBLISH_ITEM_FAILED",
  "TRENDYOL_PUBLISH_BATCH_COMPLETED"
] as const;

export async function GET() {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ success: false, error: "Yetkisiz." }, { status: 403 });
  }

  const runtime = validateRuntimeConfig({ strict: false });
  const [jobHealth, orderSyncState, xmlSyncInfo, refSyncState, recentErrors, activeStores] =
    await Promise.all([
      getOrderSyncJobsHealthSnapshot(),
      prisma.storeOrderSyncState.findMany({
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true, lastSuccessfulSyncAt: true, lastErrorMessage: true }
      }),
      prisma.xmlFeedSource.findMany({
        where: { isActive: true },
        orderBy: { lastSyncedAt: "desc" },
        take: 1,
        select: { lastSyncedAt: true, updatedAt: true }
      }),
      prisma.systemMarketplaceConnection.findUnique({
        where: { platform: "trendyol" },
        select: { lastSyncAt: true, lastSyncStatus: true, lastSyncMessage: true }
      }),
      prisma.activityLog.findMany({
        where: {
          action: {
            in: [
              "XML_SYNC_FAILED",
              "TRENDYOL_ORDER_SYNC_JOB_FAILED",
              "TRENDYOL_ORDER_WEBHOOK_FAILED",
              "TRENDYOL_INVOICE_LINK_FAILED",
              "TRENDYOL_INVOICE_FILE_FAILED",
              "TRENDYOL_WEBHOOK_CREATED",
              "TRENDYOL_WEBHOOK_UPDATED",
              "TRENDYOL_WEBHOOK_DELETED",
              "TRENDYOL_RETURN_OPERATION_FAILED",
              "TRENDYOL_RETURN_SYNC_FAILED",
              "TRENDYOL_CUSTOMER_QUESTION_ANSWER_FAILED",
              "TRENDYOL_TRACKING_UPDATE_FAILED",
              "AUTH_SESSION_FAILED"
            ]
          }
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, action: true, message: true, createdAt: true, storeId: true }
      }),
      prisma.store.findMany({
        where: { status: "active" },
        select: { id: true, name: true, featureFlags: true }
      })
    ]);

  const productV2Stores = activeStores.filter((s) =>
    isFeatureEnabled(s, FEATURE_FLAGS.PRODUCT_V2)
  );

  const productV2Rollout = await Promise.all(
    productV2Stores.map(async (store) => {
      const recent = await prisma.activityLog.findFirst({
        where: {
          storeId: store.id,
          action: { in: [...V2_PUBLISH_ACTIONS] }
        },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          message: true,
          createdAt: true
        }
      });
      const lastFailed = await prisma.activityLog.findFirst({
        where: {
          storeId: store.id,
          action: "TRENDYOL_PUBLISH_ITEM_FAILED"
        },
        orderBy: { createdAt: "desc" },
        select: { message: true, createdAt: true }
      });
      return {
        storeId: store.id,
        storeName: store.name,
        lastV2ActivityAt: recent?.createdAt.toISOString() ?? null,
        lastV2ActivityAction: recent?.action ?? null,
        lastV2ActivityMessage: recent?.message?.slice(0, 240) ?? null,
        lastV2FailureAt: lastFailed?.createdAt.toISOString() ?? null,
        lastV2FailureMessage: lastFailed?.message?.slice(0, 240) ?? null
      };
    })
  );

  return NextResponse.json({
    success: true,
    status:
      runtime.ok && jobHealth.stuckRunning === 0 && jobHealth.failedLastHour < 10
        ? "ok"
        : "degraded",
    appVersion:
      process.env.APP_VERSION ??
      process.env.npm_package_version ??
      "unknown",
    environment: process.env.NODE_ENV ?? "unknown",
    uptime: process.uptime(),
    runtimeConfig: runtime,
    db: "reachable",
    scheduler: {
      orderSyncQueue: jobHealth,
      lastOrderSyncAt: orderSyncState[0]?.lastSuccessfulSyncAt?.toISOString() ?? null,
      lastXmlSyncAt: xmlSyncInfo[0]?.lastSyncedAt?.toISOString() ?? null,
      lastReferenceSyncAt: refSyncState?.lastSyncAt?.toISOString() ?? null,
      referenceSyncStatus: refSyncState?.lastSyncStatus ?? null,
      referenceSyncMessage: refSyncState?.lastSyncMessage ?? null
    },
    recentErrors,
    productV2Rollout: {
      enabledStoreCount: productV2Stores.length,
      stores: productV2Rollout
    },
    timestamp: new Date().toISOString()
  });
}

