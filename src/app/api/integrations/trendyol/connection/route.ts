import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/secretCrypto";
import { requireActiveStore } from "@/lib/requireActiveStore";

type ConnectionPayload = {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  userAgent: string;
  environment: "stage" | "production";
  isActive: boolean;
  shipmentAddressId?: string | null;
  returnAddressId?: string | null;
  cheSupplierId?: string | null;
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
  shipmentAddressId: string | null;
  returnAddressId: string | null;
  cheSupplierId?: string | null;
}) {
  let apiKeyMasked = "—";
  let apiSecretMasked = "—";
  try {
    const key = decryptSecret(row.apiKeyEncrypted);
    const secret = decryptSecret(row.apiSecretEncrypted);
    apiKeyMasked = maskSecret(key);
    apiSecretMasked = maskSecret(secret);
  } catch {
    apiKeyMasked = "****";
    apiSecretMasked = "****";
  }

  return {
    id: row.id,
    platform: row.platform,
    sellerId: row.sellerId,
    apiKeyMasked,
    apiSecretMasked,
    userAgent: row.userAgent,
    environment: row.environment,
    isActive: row.isActive,
    lastTestAt: row.lastTestAt?.toISOString() ?? null,
    shipmentAddressId: row.shipmentAddressId ?? null,
    returnAddressId: row.returnAddressId ?? null,
    cheSupplierId:
      row.cheSupplierId != null && String(row.cheSupplierId).trim()
        ? String(row.cheSupplierId).trim()
        : null
  };
}

export async function GET() {
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.marketplaceConnection ||
      typeof anyPrisma.marketplaceConnection.findUnique !== "function"
    ) {
      return NextResponse.json(
        {
          connection: null,
          message:
            "MarketplaceConnection modeli henüz mevcut değil. Migration ve prisma generate çalıştırın."
        },
        { status: 200 }
      );
    }

    const row = await anyPrisma.marketplaceConnection.findFirst({
      where: { userId: ctx.userId, storeId: ctx.storeId, platform: "trendyol" },
      orderBy: { createdAt: "desc" }
    });

    if (!row) {
      return NextResponse.json({ connection: null });
    }

    return NextResponse.json({
      connection: serializeConnection(row)
    });
  } catch (error) {
    console.error("Trendyol connection GET error:", error);
    return NextResponse.json(
      { error: "Bağlantı bilgileri alınamadı." },
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
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  let body: Partial<ConnectionPayload>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const sellerId = typeof body.sellerId === "string" ? body.sellerId.trim() : "";
  const userAgent =
    typeof body.userAgent === "string" ? body.userAgent.trim() : "";
  const environment =
    body.environment === "stage" || body.environment === "production"
      ? body.environment
      : "production";
  const isActive = body.isActive !== false;
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret : "";

  if (!sellerId) {
    return NextResponse.json(
      { error: "Seller ID zorunludur." },
      { status: 400 }
    );
  }
  if (!userAgent) {
    return NextResponse.json(
      {
        error:
          "User-Agent zorunludur (Trendyol dokümantasyonuna uygun formatta girin)."
      },
      { status: 400 }
    );
  }

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.marketplaceConnection ||
      typeof anyPrisma.marketplaceConnection.create !== "function"
    ) {
      return NextResponse.json(
        {
          error:
            "MarketplaceConnection modeli henüz mevcut. npx prisma migrate dev çalıştırın."
        },
        { status: 503 }
      );
    }

    const existing = await anyPrisma.marketplaceConnection.findFirst({
      where: { userId: ctx.userId, storeId: ctx.storeId, platform: "trendyol" },
      orderBy: { createdAt: "desc" }
    });

    let apiKeyEncrypted: string;
    let apiSecretEncrypted: string;

    if (!existing) {
      if (!apiKey.trim() || !apiSecret.trim()) {
        return NextResponse.json(
          {
            error: "İlk kayıtta API Key ve API Secret zorunludur."
          },
          { status: 400 }
        );
      }
      apiKeyEncrypted = encryptSecret(apiKey.trim());
      apiSecretEncrypted = encryptSecret(apiSecret.trim());
    } else {
      apiKeyEncrypted = existing.apiKeyEncrypted;
      apiSecretEncrypted = existing.apiSecretEncrypted;
      if (apiKey.trim()) {
        apiKeyEncrypted = encryptSecret(apiKey.trim());
      }
      if (apiSecret.trim()) {
        apiSecretEncrypted = encryptSecret(apiSecret.trim());
      }
    }

    const shipIn = body.shipmentAddressId;
    const retIn = body.returnAddressId;
    const shipmentAddressId =
      shipIn === undefined
        ? undefined
        : shipIn === null || (typeof shipIn === "string" && !shipIn.trim())
          ? null
          : String(shipIn).trim();
    const returnAddressId =
      retIn === undefined
        ? undefined
        : retIn === null || (typeof retIn === "string" && !retIn.trim())
          ? null
          : String(retIn).trim();

    const cheIn = body.cheSupplierId;
    const cheSupplierId =
      cheIn === undefined
        ? undefined
        : cheIn === null || (typeof cheIn === "string" && !cheIn.trim())
          ? null
          : String(cheIn).trim();

    const row = existing
      ? await anyPrisma.marketplaceConnection.update({
          where: { id: existing.id },
          data: {
            sellerId,
            apiKeyEncrypted,
            apiSecretEncrypted,
            userAgent,
            environment,
            isActive,
            ...(shipmentAddressId !== undefined && { shipmentAddressId }),
            ...(returnAddressId !== undefined && { returnAddressId }),
            ...(cheSupplierId !== undefined && { cheSupplierId })
          }
        })
      : await anyPrisma.marketplaceConnection.create({
          data: {
            userId: ctx.userId,
            storeId: ctx.storeId,
            platform: "trendyol",
            sellerId,
            apiKeyEncrypted,
            apiSecretEncrypted,
            userAgent,
            environment,
            isActive,
            ...(shipmentAddressId !== undefined && { shipmentAddressId }),
            ...(returnAddressId !== undefined && { returnAddressId }),
            ...(cheSupplierId !== undefined && { cheSupplierId })
          }
        });

    return NextResponse.json({
      success: true,
      connection: serializeConnection(row)
    });
  } catch (error) {
    console.error("Trendyol connection POST error:", error);
    const msg =
      error instanceof Error ? error.message : "Kayıt sırasında hata oluştu.";
    if (msg.includes("ENCRYPTION_KEY")) {
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Bağlantı kaydedilemedi." },
      { status: 500 }
    );
  }
}
