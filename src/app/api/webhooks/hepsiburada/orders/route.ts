/**
 * POST /api/webhooks/hepsiburada/orders
 *
 * Hepsiburada "reverse webhook" modeli: bu URL, Hepsiburada'ya partner
 * panelinden/destek ekibiyle BaseURL olarak bildirilmelidir (BaseURL + "/orders").
 * HB, paket oluşturma/güncelleme olaylarında buraya POST atar.
 *
 * Response idempotent olmalıdır (HB dokümantasyonunun vurguladığı gibi);
 * upsertHbPackageForStore zaten idempotent upsert yapar.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityLog } from "@/lib/activityLog";
import { logger } from "@/lib/logger";
import { getRequestId } from "@/lib/requestContext";
import {
  upsertHbPackageForStore,
  HB_INGEST_SOURCE
} from "@/lib/hepsiburadaOrderIngest";
import { parseHbOrderWebhookPayload } from "@/lib/hepsiburadaOrderWebhookPayload";

export const dynamic = "force-dynamic";

function verifyWebhookSecret(request: Request): NextResponse | null {
  const secret = process.env.HB_ORDER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    logger.warn("hb_webhook_secret_missing", {
      route: "/api/webhooks/hepsiburada/orders"
    });
    return null;
  }

  const headerSecret =
    request.headers.get("x-hepsiburada-webhook-secret")?.trim() ??
    request.headers.get("x-webhook-secret")?.trim();

  const auth = request.headers.get("authorization")?.trim();
  const bearer =
    auth && /^Bearer\s+/i.test(auth) ? auth.replace(/^Bearer\s+/i, "").trim() : null;
  const basicAuthUser =
    auth && /^Basic\s+/i.test(auth)
      ? (() => {
          try {
            const decoded = Buffer.from(
              auth.replace(/^Basic\s+/i, "").trim(),
              "base64"
            ).toString("utf8");
            return decoded.split(":")[0]?.trim() ?? null;
          } catch {
            return null;
          }
        })()
      : null;

  const provided = headerSecret ?? bearer ?? basicAuthUser;
  if (!provided || provided !== secret) {
    logger.warn("hb_webhook_unauthorized", {
      route: "/api/webhooks/hepsiburada/orders"
    });
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const authErr = verifyWebhookSecret(request);
  if (authErr) return authErr;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  const { merchantKey, packages } = parseHbOrderWebhookPayload(rawBody);

  if (packages.length === 0) {
    return NextResponse.json(
      { error: "İşlenecek paket / sipariş gövdesi bulunamadı" },
      { status: 400 }
    );
  }

  if (!merchantKey) {
    return NextResponse.json(
      {
        error: "Satıcı eşleştirilemiyor: payload içinde merchantId bekleniyor"
      },
      { status: 400 }
    );
  }

  const conn = await prisma.marketplaceConnection.findFirst({
    where: {
      platform: "hepsiburada",
      isActive: true,
      sellerId: merchantKey
    },
    orderBy: { updatedAt: "desc" }
  });

  if (!conn) {
    logger.warn("hb_webhook_connection_missing", {
      route: "/api/webhooks/hepsiburada/orders",
      requestId,
      merchantId: merchantKey,
      packageCount: packages.length
    });
    return NextResponse.json(
      {
        error: `Aktif Hepsiburada mağaza bağlantısı yok (merchantId: ${merchantKey})`
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
    merchantKey,
    packageCount: packages.length,
    storeId
  } satisfies Record<string, unknown>;

  await createActivityLog({
    userId,
    storeId,
    membershipId: membership?.id ?? undefined,
    action: "HB_ORDER_WEBHOOK_RECEIVED",
    entityType: "marketplace_order",
    message: `Hepsiburada sipariş webhook alındı (${packages.length} paket, merchantId=${merchantKey}).`
  });

  await prisma.marketplaceOrderEvent.create({
    data: {
      storeId,
      orderId: null,
      action: "HB_ORDER_WEBHOOK_RECEIVED",
      message: `${packages.length} paket`,
      rawData: safeLogPayload as unknown as Prisma.JsonObject
    }
  });

  const packageIds: string[] = [];

  try {
    for (const pkg of packages) {
      const { orderId, packageId } = await upsertHbPackageForStore({
        storeId,
        raw: pkg,
        ingestSource: HB_INGEST_SOURCE.WEBHOOK,
        activityContext: { userId, membershipId: membership?.id ?? null }
      });
      packageIds.push(packageId);

      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId,
          action: "HB_ORDER_WEBHOOK_PROCESSED",
          message: `Webhook ile paket güncellendi: ${packageId}`,
          rawData: { packageId } as unknown as Prisma.JsonObject
        }
      });
    }

    await createActivityLog({
      userId,
      storeId,
      membershipId: membership?.id ?? undefined,
      action: "HB_ORDER_WEBHOOK_PROCESSED",
      entityType: "marketplace_order",
      message: `Hepsiburada webhook işlendi. Paket: ${packageIds.join(", ")}`
    });

    await prisma.storeOrderSyncState.upsert({
      where: {
        storeId_platform: { storeId, platform: "hepsiburada" }
      },
      create: {
        storeId,
        platform: "hepsiburada",
        lastWebhookSeenAt: new Date()
      },
      update: { lastWebhookSeenAt: new Date() }
    });

    return NextResponse.json({
      success: true,
      processed: packageIds.length,
      packageIds
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Webhook paket işleme hatası";
    logger.error("hb_webhook_failed", {
      route: "/api/webhooks/hepsiburada/orders",
      requestId,
      storeId,
      userId,
      error: msg
    });

    await createActivityLog({
      userId,
      storeId,
      membershipId: membership?.id ?? undefined,
      action: "HB_ORDER_WEBHOOK_FAILED",
      entityType: "marketplace_order",
      message: msg
    });

    try {
      await prisma.marketplaceOrderEvent.create({
        data: {
          storeId,
          orderId: null,
          action: "HB_ORDER_WEBHOOK_FAILED",
          message: msg,
          rawData: safeLogPayload as unknown as Prisma.JsonObject
        }
      });
    } catch {
      // ignore
    }

    return NextResponse.json({ success: false, error: msg, requestId }, { status: 500 });
  }
}
