import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isImportUsable } from "@/lib/importStatus";

type Params = { params: { id: string } };

function getUserIdFromSession(session: {
  user?: { id?: string } | null;
} | null): string | null {
  if (!session?.user?.id) return null;
  return session.user.id;
}

/**
 * GET /api/imports/[id]/suggestions
 * id = ImportJob id. Trendyol öneri kayıtlarını (satır bazlı) listeler.
 *
 * Query: importRowId (opsiyonel), limit (varsayılan 50), offset
 */
export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  const userId = getUserIdFromSession(session);
  if (!userId) {
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  const job = await prisma.importJob.findFirst({
    where: { id: params.id, userId }
  });

  if (!job) {
    return NextResponse.json({ error: "İçe aktarma bulunamadı." }, { status: 404 });
  }
  if (!isImportUsable(job)) {
    return NextResponse.json(
      { error: "Pasif import verisi suggestion listesinde kullanılamaz." },
      { status: 400 }
    );
  }

  const { searchParams } = new URL(request.url);
  const importRowId = searchParams.get("importRowId")?.trim();
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  if (importRowId) {
    const row = await prisma.importRow.findFirst({
      where: { id: importRowId, importJobId: params.id }
    });
    if (!row) {
      return NextResponse.json({ error: "Satır bu işe ait değil." }, { status: 404 });
    }
  }

  const where = {
    importRow: { importJobId: params.id },
    ...(importRowId ? { importRowId } : {})
  };

  const [rows, total] = await Promise.all([
    prisma.importRowMarketplaceSuggestion.findMany({
      where,
      include: {
        importRow: { select: { rowIndex: true } },
        suggestedAttributes: {
          orderBy: [{ isRequired: "desc" }, { attributeName: "asc" }]
        }
      },
      orderBy: [{ importRowId: "asc" }, { updatedAt: "desc" }],
      take: limit,
      skip: offset
    }),
    prisma.importRowMarketplaceSuggestion.count({ where })
  ]);

  const suggestions = rows.map((s) => {
    const { importRow, ...rest } = s;
    return {
      ...rest,
      rowIndex: importRow.rowIndex
    };
  });

  return NextResponse.json({
    importJobId: params.id,
    suggestions,
    pagination: { limit, offset, total }
  });
}
