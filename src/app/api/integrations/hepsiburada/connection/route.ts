import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/secretCrypto";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { jsonError } from "@/lib/errors/errorResponse";

type ConnectionPayload = {
  merchantId: string;
  apiKey: string;
  apiSecret: string;
  /** Opsiyonel; boş string gönderilirse mevcut anahtar korunur; silmek için clearServiceKey */
  serviceKey?: string;
  clearServiceKey?: boolean;
  userAgent: string;
  environment: "test" | "production";
  isActive: boolean;
};

function serializeConnection(row: {
  id: string;
  platform: string;
  sellerId: string;
  userAgent: string;
  environment: string;
  isActive: boolean;
  lastTestAt: Date | null;
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
  serviceKeyEncrypted?: string | null;
}) {
  let apiKeyMasked = "—";
  let apiSecretMasked = "—";
  let serviceKeyMasked: string | null = null;
  try {
    const key = decryptSecret(row.apiKeyEncrypted);
    const secret = decryptSecret(row.apiSecretEncrypted);
    apiKeyMasked = maskSecret(key);
    apiSecretMasked = maskSecret(secret);
  } catch {
    apiKeyMasked = "****";
    apiSecretMasked = "****";
  }
  if (row.serviceKeyEncrypted?.trim()) {
    try {
      serviceKeyMasked = maskSecret(decryptSecret(row.serviceKeyEncrypted));
    } catch {
      serviceKeyMasked = "****";
    }
  }

  return {
    id: row.id,
    platform: row.platform,
    merchantId: row.sellerId,
    apiKeyMasked,
    apiSecretMasked,
    serviceKeyMasked,
    hasServiceKey: Boolean(row.serviceKeyEncrypted?.trim()),
    userAgent: row.userAgent,
    environment: row.environment,
    isActive: row.isActive,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
  };
}

export async function GET() {
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
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const row = await prisma.marketplaceConnection.findFirst({
      where: { storeId: ctx.storeId, platform: "hepsiburada" },
      orderBy: { createdAt: "desc" },
    });

    if (!row) {
      return NextResponse.json({ connection: null });
    }

    return NextResponse.json({
      connection: serializeConnection(row),
    });
  } catch (error: any) {
    console.error("GET hepsiburada connection error:", error);
    return jsonError("INTERNAL_ERROR", {
      internalMessage: error.message,
      httpStatus: 500,
    });
  }
}

export async function POST(req: Request) {
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
  } catch {
    return jsonError("FORBIDDEN", { httpStatus: 403 });
  }

  try {
    const body: Partial<ConnectionPayload> = await req.json();

    if (!body.merchantId) {
      return jsonError("VALIDATION_ERROR", {
        internalMessage: "merchantId is required.",
        httpStatus: 400,
      });
    }
    if (!body.userAgent) {
      return jsonError("VALIDATION_ERROR", {
        internalMessage: "userAgent is required.",
        httpStatus: 400,
      });
    }

    const existing = await prisma.marketplaceConnection.findFirst({
      where: { storeId: ctx.storeId, platform: "hepsiburada" },
    });

    let newEncryptedKey: string | undefined;
    let newEncryptedSecret: string | undefined;
    let newEncryptedServiceKey: string | null | undefined;

    if (body.apiKey) {
      newEncryptedKey = encryptSecret(body.apiKey.trim());
    }
    if (body.apiSecret) {
      newEncryptedSecret = encryptSecret(body.apiSecret.trim());
    }
    if (body.clearServiceKey) {
      newEncryptedServiceKey = null;
    } else if (typeof body.serviceKey === "string" && body.serviceKey.trim()) {
      newEncryptedServiceKey = encryptSecret(body.serviceKey.trim());
    }

    if (!existing) {
      if (!newEncryptedKey || !newEncryptedSecret) {
        return jsonError("VALIDATION_ERROR", {
          internalMessage: "apiKey and apiSecret are required for new connection.",
          httpStatus: 400,
        });
      }

      const created = await prisma.marketplaceConnection.create({
        data: {
          platform: "hepsiburada",
          userId: ctx.userId,
          storeId: ctx.storeId,
          sellerId: body.merchantId.trim(),
          apiKeyEncrypted: newEncryptedKey,
          apiSecretEncrypted: newEncryptedSecret,
          serviceKeyEncrypted: newEncryptedServiceKey ?? undefined,
          userAgent: body.userAgent.trim(),
          environment: body.environment === "test" ? "test" : "production",
          isActive: body.isActive ?? true,
        },
      });
      return NextResponse.json({ connection: serializeConnection(created) });
    }

    const updated = await prisma.marketplaceConnection.update({
      where: { id: existing.id },
      data: {
        sellerId: body.merchantId.trim(),
        apiKeyEncrypted: newEncryptedKey ?? existing.apiKeyEncrypted,
        apiSecretEncrypted: newEncryptedSecret ?? existing.apiSecretEncrypted,
        ...(newEncryptedServiceKey !== undefined
          ? { serviceKeyEncrypted: newEncryptedServiceKey }
          : {}),
        userAgent: body.userAgent.trim(),
        environment: body.environment === "test" ? "test" : "production",
        isActive: body.isActive ?? existing.isActive,
      },
    });
    return NextResponse.json({ connection: serializeConnection(updated) });
  } catch (error: any) {
    console.error("POST hepsiburada connection error:", error);
    return jsonError("INTERNAL_ERROR", {
      internalMessage: error.message,
      httpStatus: 500,
    });
  }
}
