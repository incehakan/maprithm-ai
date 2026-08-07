import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireActiveStore, requirePermission } from "@/lib/requireActiveStore";
import { decryptSecret } from "@/lib/secretCrypto";

export async function GET(req: NextRequest) {
  try {
    let ctx;
    try {
      ctx = await requireActiveStore();
    } catch (e: any) {
      return NextResponse.json({ error: e?.message === "NO_ACTIVE_STORE" ? "Aktif mağaza yok." : "Yetkisiz." }, { status: 401 });
    }
    
    try {
      requirePermission(ctx, "marketplace.integrations.view");
    } catch {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const batchRequestId = searchParams.get("batchRequestId");

    if (!batchRequestId) {
        return NextResponse.json({ error: "batchRequestId gereklidir." }, { status: 400 });
    }

    const conn = await prisma.marketplaceConnection.findFirst({
      where: { storeId: ctx.storeId, platform: "TRENDYOL", isActive: true },
    });

    if (!conn || !conn.sellerId) {
      return NextResponse.json({ error: "Aktif Trendyol bağlantısı yok." }, { status: 400 });
    }

    const apiKey = decryptSecret(conn.apiKeyEncrypted);
    const apiSecret = decryptSecret(conn.apiSecretEncrypted);

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API Key veya Secret çözülemedi." }, { status: 500 });
    }

    const url = `https://api.trendyol.com/sapigw/suppliers/${conn.sellerId}/products/batch-requests/${batchRequestId}`;
    
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}`,
        "User-Agent": `${conn.sellerId} - Maprithm`,
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Trendyol API Hatası: ${errorText}`);
    }

    const data = await res.json();

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Trendyol batch status error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
