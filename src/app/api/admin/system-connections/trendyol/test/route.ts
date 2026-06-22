import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secretCrypto";
import { testTrendyolPartnerConnection } from "@/lib/trendyolPartnerApi";
import { requireSystemAdmin } from "@/lib/requireSystemAdmin";

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
      }
    | null;

  const existing = await prisma.systemMarketplaceConnection.findUnique({
    where: { platform: "trendyol" }
  });

  const sellerId = body?.sellerId?.trim() || existing?.sellerId || "";
  const userAgent = body?.userAgent?.trim() || existing?.userAgent || "";
  const environment =
    body?.environment === "stage" || body?.environment === "production"
      ? body.environment
      : existing?.environment === "stage"
        ? "stage"
        : "production";

  if (!sellerId || !userAgent) {
    return NextResponse.json(
      { error: "Satıcı ID ve User-Agent zorunludur." },
      { status: 400 }
    );
  }

  let apiKey = body?.apiKey?.trim() ?? "";
  let apiSecret = body?.apiSecret?.trim() ?? "";

  if ((!apiKey || !apiSecret) && existing) {
    try {
      if (!apiKey) apiKey = decryptSecret(existing.apiKeyEncrypted);
      if (!apiSecret) apiSecret = decryptSecret(existing.apiSecretEncrypted);
    } catch {
      return NextResponse.json(
        { error: "Kayıtlı kimlik bilgileri çözülemedi." },
        { status: 500 }
      );
    }
  }

  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Test için API Key ve API Secret gereklidir." },
      { status: 400 }
    );
  }

  const result = await testTrendyolPartnerConnection({
    sellerId,
    apiKey,
    apiSecret,
    userAgent,
    environment,
    clientIp: resolveClientIp(request),
    agentName: "Maprithm"
  });

  return NextResponse.json({
    success: result.ok,
    status: result.status,
    message: result.message
  });
}
