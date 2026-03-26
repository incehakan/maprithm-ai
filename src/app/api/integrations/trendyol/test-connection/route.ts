import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretCrypto";
import { testTrendyolPartnerConnection } from "@/lib/trendyolPartnerApi";
import { createActivityLog } from "@/lib/activityLog";

function resolveClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first && /^[\d.]+$/.test(first)) {
      return first;
    }
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real && /^[\d.]+$/.test(real)) {
    return real;
  }
  const fallback = process.env.TRENDYOL_FALLBACK_CLIENT_IP?.trim();
  if (fallback && /^[\d.]+$/.test(fallback)) {
    return fallback;
  }
  return "127.0.0.1";
}

function resolveAgentName(sessionEmail: string | null | undefined): string {
  const env = process.env.TRENDYOL_AGENT_NAME?.trim();
  if (env) return env.slice(0, 120);
  if (sessionEmail) {
    const local = sessionEmail.split("@")[0];
    if (local) return local.slice(0, 120);
  }
  return "Maprithm";
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const userId = (session.user as any).id as string;
  const userEmail = session.user?.email;

  try {
    const anyPrisma = prisma as any;
    if (
      !anyPrisma.marketplaceConnection ||
      typeof anyPrisma.marketplaceConnection.findUnique !== "function"
    ) {
      return NextResponse.json(
        {
          error:
            "MarketplaceConnection modeli henüz mevcut. Migration ve prisma generate çalıştırın."
        },
        { status: 503 }
      );
    }

    const row = await anyPrisma.marketplaceConnection.findUnique({
      where: {
        userId_platform: {
          userId,
          platform: "trendyol"
        }
      }
    });

    if (!row) {
      return NextResponse.json(
        { error: "Önce Trendyol bağlantı bilgilerini kaydedin." },
        { status: 404 }
      );
    }

    if (!row.isActive) {
      return NextResponse.json(
        { error: "Bağlantı pasif. Önce aktif hale getirin." },
        { status: 400 }
      );
    }

    let apiKey: string;
    let apiSecret: string;
    try {
      apiKey = decryptSecret(row.apiKeyEncrypted);
      apiSecret = decryptSecret(row.apiSecretEncrypted);
    } catch (e) {
      console.error("Decrypt Trendyol credentials error:", e);
      return NextResponse.json(
        {
          error:
            "Kimlik bilgileri çözülemedi. ENCRYPTION_KEY doğru mu kontrol edin."
        },
        { status: 500 }
      );
    }

    const environment =
      row.environment === "stage" || row.environment === "production"
        ? row.environment
        : "production";

    const clientIp = resolveClientIp(request);
    const agentName = resolveAgentName(userEmail);

    const result = await testTrendyolPartnerConnection({
      sellerId: row.sellerId,
      apiKey,
      apiSecret,
      userAgent: row.userAgent,
      environment,
      clientIp,
      agentName
    });

    const updated = await anyPrisma.marketplaceConnection.update({
      where: { id: row.id },
      data: { lastTestAt: new Date() }
    });

    await createActivityLog({
      userId,
      action: "TRENDYOL_CONNECTION_TESTED",
      entityType: "MARKETPLACE_CONNECTION",
      entityId: row.id,
      message: result.ok
        ? `Trendyol bağlantısı test edildi: başarılı (HTTP ${result.status})`
        : `Trendyol bağlantısı test edildi: başarısız (HTTP ${result.status}) — ${result.message}`
    });

    return NextResponse.json({
      success: result.ok,
      status: result.status,
      message: result.message,
      lastTestAt: updated.lastTestAt?.toISOString() ?? null
    });
  } catch (error) {
    console.error("Trendyol test-connection error:", error);
    return NextResponse.json(
      { error: "Bağlantı testi sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
