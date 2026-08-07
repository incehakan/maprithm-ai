import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { trendyolBrandListableWhere } from "@/lib/trendyolListable";

/**
 * Trendyol marka combobox için sunucu taraflı arama.
 * Tüm tabloyu çekmek yerine name ILIKE ile eşleşenleri döner (ilk 8000 kayıt limitini aşar).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1),
    80
  );

  if (q.length < 2) {
    return NextResponse.json({
      brands: [],
      hint: "En az 2 karakter girin."
    });
  }

  const brands = await prisma.marketplaceBrand.findMany({
    where: {
      platform: "TRENDYOL",
      name: { contains: q, mode: "insensitive" },
      isActive: true
    },
    select: {
      externalId: true,
      name: true,
      isActive: true
    },
    orderBy: { name: "asc" },
    take: limit
  }).then(list => list.map(b => ({ brandId: parseInt(b.externalId, 10), name: b.name, isActive: b.isActive })));

  return NextResponse.json({ brands });
}
