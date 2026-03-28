import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import {
  TRENDYOL_ORDER_INGEST_SOURCE,
  upsertTrendyolShipmentPackageForStore
} from "@/lib/trendyolOrderIngestFromPackage";
import { parseTrendyolOrderWebhookPayload } from "@/lib/trendyolOrderWebhookPayload";
import {
  enqueueOrderSyncJob,
  processOrderSyncQueue
} from "@/lib/trendyolOrderBackgroundSync";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: Request): NextResponse | null {
  const secret = process.env.TRENDYOL_ORDER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn(
      "[Trendyol order webhook] TRENDYOL_ORDER_WEBHOOK_SECRET tanımlı değil; imza doğrulanmıyor"
    );
    return null;
  }

  const headerSecret =
    request.headers.get("x-trendyol-webhook-secret")?.trim() ??
    request.headers.get("x-webhook-secret")?.trim() ??
    request.headers.get("x-trendyol-signature")?.trim();

  const auth = request.headers.get("authorization")?.trim();
  const bearer =
    auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : null;

  const provided = headerSecret ?? bearer;
  if (!provided || provided !== secret) {
    console.warn(
      "[Trendyol order webhook] Geçersiz veya eksik secret (x-trendyol-webhook-secret / x-webhook-secret / Authorization: Bearer)"
    );
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const authErr = verifyWebhookSecret(request);
  if (authErr) return authErr;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  const { sellerKey, packages } = parseTrendyolOrderWebhookPayload(rawBody);

  if (packages.length === 0) {
    return NextResponse.json(
      { error: "İşlenecek paket / sipariş gövdesi bulunamadı" },
      { status: 400 }
    );
  }

  if (!sellerKey) {
    return NextResponse.json(
      {
        error:
          "Satıcı eşleştirilemiyor: payload içinde supplierId, sellerId veya merchantId bekleniyor"
      },
      { status: 400 }
    );
  }

  const conn = await prisma.marketplaceConnection.findFirst({
    where: {
      platform: "trendyol",
      isActive: true,
      sellerId: sellerKey
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!conn) {
    console.warn(
      `[Trendyol order webhook] Bağlantı yok: sellerId=${sellerKey}, paket=${packages.length}`
    );
    return NextResponse.json(
      {
        error: `Aktif Trendyol mağaza bağlantısı yok (sellerId: ${sellerKey})`
      },
      { status: 400 }
    );
  }

  const storeId = conn.storeId;
  const userId = conn.userId;

  const membership = await prisma.storeMembership.findFirst({
    where: { userId: conn.userId, storeId: conn.storeId, isActive: true },
    orderBy: { createdAt: "asc" }
  });

  const safeLogPayload = {
    sellerKey,
    packageCount: packages.length,
    storeId
  } satisfies Record<string, unknown>;

  await createActivityLog({
    userId,
    storeId,
    membershipId: membership?.id ?? undefined,
    action: "TRENDYOL_ORDER_WEBHOOK_RECEIVED",
    entityType: "marketplace_order",
    message: `Trendyol sipariş webhook alındı (${packages.length} paket, sellerId=${sellerKey}).`
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: null,
      action: "TRENDYOL_ORDER_WEBHOOK_RECEIVED",
      message: `${packages.length} paket`,
      rawData: safeLogPayload as unknown as Prisma.JsonObject
    }
  });

  const shipmentIds: string[] = [];

  try {
    for (const pkg of packages) {
      const { orderId, shipmentPackageId } =
        await upsertTrendyolShipmentPackageForStore(prisma, {
          storeId,
          raw: pkg,
          ingestSource: TRENDYOL_ORDER_INGEST_SOURCE.WEBHOOK,
          activityContext: { userId, membershipId: membership?.id ?? null }
        });
      shipmentIds.push(shipmentPackageId);

      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId,
          action: "TRENDYOL_ORDER_WEBHOOK_PROCESSED",
          message: `Webhook ile paket güncellendi: ${shipmentPackageId}`,
          rawData: { shipmentPackageId } as unknown as Prisma.JsonObject
        }
      });
    }

    await createActivityLog({
      userId,
      storeId,
      membershipId: membership?.id ?? undefined,
      action: "TRENDYOL_ORDER_WEBHOOK_PROCESSED",
      entityType: "marketplace_order",
      message: `Trendyol webhook işlendi. Paket: ${shipmentIds.join(", ")}`
    });

    await prisma.storeOrderSyncState.upsert({
      where: {
        storeId_platform: { storeId, platform: "trendyol" }
      },
      create: {
        storeId,
        platform: "trendyol",
        lastWebhookSeenAt: new Date()
      },
      update: { lastWebhookSeenAt: new Date() }
    });

    const recentReconcile = await prisma.orderSyncJob.findFirst({
      where: {
        storeId,
        platform: "trendyol",
        syncType: "webhook_reconcile",
        createdAt: { gte: new Date(Date.now() - 8 * 60 * 1000) }
      },
      select: { id: true }
    });
    if (!recentReconcile) {
      await enqueueOrderSyncJob({
        storeId,
        syncType: "webhook_reconcile",
        triggeredByUserId: userId,
        membershipId: membership?.id ?? null,
        options: { pullKind: "reconcile" }
      });
    }

    await processOrderSyncQueue({ maxJobs: 8 });

    return NextResponse.json({
      success: true,
      processed: shipmentIds.length,
      shipmentPackageIds: shipmentIds
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Webhook paket işleme hatası";
    console.error("[Trendyol order webhook]", err);

    await createActivityLog({
      userId,
      storeId,
      membershipId: membership?.id ?? undefined,
      action: "TRENDYOL_ORDER_WEBHOOK_FAILED",
      entityType: "marketplace_order",
      message: msg
    });

    try {
      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId: null,
          action: "TRENDYOL_ORDER_WEBHOOK_FAILED",
          message: msg,
          rawData: safeLogPayload as unknown as Prisma.JsonObject
        }
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
