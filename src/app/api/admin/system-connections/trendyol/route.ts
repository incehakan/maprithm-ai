import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secretCrypto";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

function serialize(row: {
  id: string;
  platform: string;
  sellerId: string;
  userAgent: string;
  environment: string;
  isActive: boolean;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
}) {
  let apiKeyMasked = "****";
  let apiSecretMasked = "****";
  try {
    apiKeyMasked = maskSecret(decryptSecret(row.apiKeyEncrypted));
    apiSecretMasked = maskSecret(decryptSecret(row.apiSecretEncrypted));
  } catch {
    // ignore
  }
  return {
    id: row.id,
    platform: row.platform,
    sellerId: row.sellerId,
    userAgent: row.userAgent,
    environment: row.environment,
    isActive: row.isActive,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: row.lastSyncStatus ?? null,
    lastSyncMessage: row.lastSyncMessage ?? null,
    apiKeyMasked,
    apiSecretMasked
  };
}

export async function GET() {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const row = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" }
  });

  return NextResponse.json({ connection: row ? serialize(row) : null });
}

export async function POST(request: Request) {
  try {
    await requireSystemAdmin();
  } catch {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        sellerId?: string;
        apiKey?: string;
        apiSecret?: string;
        userAgent?: string;
        environment?: "stage" | "production";
        isActive?: boolean;
      }
    | null;

  const sellerId = body?.sellerId?.trim() ?? "";
  const userAgent = body?.userAgent?.trim() ?? "";
  const environment =
    body?.environment === "stage" || body?.environment === "production"
      ? body.environment
      : "production";
  const isActive = body?.isActive !== false;
  const apiKey = body?.apiKey?.trim() ?? "";
  const apiSecret = body?.apiSecret?.trim() ?? "";

  if (!sellerId || !userAgent) {
    return NextResponse.json(
      { error: "sellerId ve userAgent zorunludur." },
      { status: 400 }
    );
  }

  const existing = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" }
  });

  let apiKeyEncrypted = existing?.apiKeyEncrypted;
  let apiSecretEncrypted = existing?.apiSecretEncrypted;

  if (!existing && (!apiKey || !apiSecret)) {
    return NextResponse.json(
      { error: "İlk kayıtta apiKey ve apiSecret zorunludur." },
      { status: 400 }
    );
  }
  if (apiKey) apiKeyEncrypted = encryptSecret(apiKey);
  if (apiSecret) apiSecretEncrypted = encryptSecret(apiSecret);

  const row = existing
    ? await prisma.systemMarketplaceConnection.update({
        where: { platform: "trendyol" },
        data: {
          sellerId,
          userAgent,
          environment,
          isActive,
          apiKeyEncrypted,
          apiSecretEncrypted
        }
      })
    : await prisma.systemMarketplaceConnection.create({
        data: {
          platform: "trendyol",
          sellerId,
          userAgent,
          environment,
          isActive,
          apiKeyEncrypted: apiKeyEncrypted!,
          apiSecretEncrypted: apiSecretEncrypted!
        }
      });

  return NextResponse.json({ success: true, connection: serialize(row) });
}

