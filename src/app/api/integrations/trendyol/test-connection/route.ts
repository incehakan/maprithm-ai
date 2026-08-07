import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretCrypto";
import { testTrendyolPartnerConnection } from "@/lib/trendyolPartnerApi";
import { createActivityLog } from "@/lib/activityLog";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { secureMarketplaceConnectionUpdateMany } from "@/lib/security/storeScope";
import { isStoreProductV2Enabled } from "@/lib/trendyolStoreProductV2";

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
  let ctx: Awaited<ReturnType<typeof requireActiveStore>>;
  try {
    ctx = await requireActiveStore();
  } catch (e: any) {
    const msg = e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz.";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  try {
    requirePermission(ctx, "marketplace.integrations.manage");
  } catch (e: any) {
    return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 403 });
  }

  try {
    const row = await prisma.marketplaceConnection.findUnique({
      where: {
        storeId_platform: {
          storeId: ctx.storeId,
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
    const agentName = resolveAgentName(null);

    // Görev 8: mağazanın PRODUCT_V2 flag'i açıksa bağlantı testi de
    // V2 filterApprovedProducts ucunu dener; kapalıysa V1 filterProducts'a
    // sessizce düşer (davranış değişmez).
    const useProductV2Filter = await isStoreProductV2Enabled(ctx.storeId);

    const result = await testTrendyolPartnerConnection({
      sellerId: row.sellerId,
      apiKey,
      apiSecret,
      userAgent: row.userAgent,
      environment,
      clientIp,
      agentName,
      useProductV2Filter
    });

    await secureMarketplaceConnectionUpdateMany(row.id, ctx.storeId, {
      lastTestAt: new Date()
    });
    const updated = await prisma.marketplaceConnection.findFirst({
      where: { id: row.id, storeId: ctx.storeId }
    });

    await createActivityLog({
      userId: ctx.userId,
      storeId: ctx.storeId,
      membershipId: ctx.membershipId,
      action: "TRENDYOL_CONNECTION_TESTED",
      entityType: "MARKETPLACE_CONNECTION",
      entityId: row.id,
      message: result.ok
        ? `Trendyol bağlantısı test edildi: başarılı (HTTP ${result.status}, ${useProductV2Filter ? "V2" : "V1"} uç noktası)`
        : `Trendyol bağlantısı test edildi: başarısız (HTTP ${result.status}, ${useProductV2Filter ? "V2" : "V1"} uç noktası) — ${result.message}`
    });

    return NextResponse.json({
      success: result.ok,
      status: result.status,
      message: result.message,
      apiVersion: useProductV2Filter ? "v2" : "v1",
      lastTestAt: updated?.lastTestAt?.toISOString() ?? null
    });
  } catch (error) {
    console.error("Trendyol test-connection error:", error);
    return NextResponse.json(
      { error: "Bağlantı testi sırasında hata oluştu." },
      { status: 500 }
    );
  }
}
