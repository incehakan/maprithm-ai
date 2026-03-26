import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

type Body = {
  productIds?: string[];
};

/**
 * POST /api/trendyol/publish-readiness/mark-ready
 * Sets Trendyol mapping publishStatus to ready for selected products.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = getUserIdFromSession(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON." }, { status: 400 });
  }

  const ids = Array.isArray(body.productIds)
    ? body.productIds.filter((x) => typeof x === "string" && x.length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "En az bir productId gerekli." },
      { status: 400 }
    );
  }

  const owned = await prisma.product.findMany({
    where: { userId, id: { in: ids } },
    select: { id: true }
  });
  const ownedSet = new Set(owned.map((p) => p.id));
  const invalid = ids.filter((id) => !ownedSet.has(id));

  if (invalid.length > 0) {
    return NextResponse.json(
      {
        error: "Bazı ürünler bulunamadı veya size ait değil.",
        invalidProductIds: invalid
      },
      { status: 400 }
    );
  }

  const result = await prisma.productMarketplaceMapping.updateMany({
    where: {
      userId,
      platform: "trendyol",
      productId: { in: ids }
    },
    data: { publishStatus: "ready" }
  });

  await prisma.product.updateMany({
    where: { userId, id: { in: ids } },
    data: { lifecycleStatus: "ready" }
  });

  return NextResponse.json({
    success: true,
    requested: ids.length,
    mappingsUpdated: result.count
  });
}
